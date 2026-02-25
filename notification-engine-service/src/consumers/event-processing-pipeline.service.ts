import { Injectable, Logger } from '@nestjs/common';
import { RuleCacheService } from '../rules/rule-cache.service.js';
import { RuleMatcherService } from '../rules/rule-engine/rule-matcher.service.js';
import { PriorityResolverService } from '../rules/rule-engine/priority-resolver.service.js';
import { RecipientResolverService } from '../recipients/recipient-resolver.service.js';
import { ChannelResolverService } from '../recipients/channel-resolver.service.js';
import { DedupKeyResolverService } from '../notifications/suppression/dedup-key-resolver.service.js';
import { SuppressionEvaluatorService } from '../notifications/suppression/suppression-evaluator.service.js';
import { NotificationsRepository } from '../notifications/notifications.repository.js';
import { NotificationLifecycleService } from '../notifications/notification-lifecycle.service.js';
import { TemplateClientService } from '../template-client/template-client.service.js';
import { NotificationPublisherService } from '../rabbitmq/notification-publisher.service.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { NormalizedEventMessage } from '../rabbitmq/interfaces/normalized-event-message.interface.js';

@Injectable()
export class EventProcessingPipelineService {
  private readonly logger = new Logger(EventProcessingPipelineService.name);

  constructor(
    private readonly ruleCacheService: RuleCacheService,
    private readonly ruleMatcherService: RuleMatcherService,
    private readonly priorityResolverService: PriorityResolverService,
    private readonly recipientResolverService: RecipientResolverService,
    private readonly channelResolverService: ChannelResolverService,
    private readonly dedupKeyResolverService: DedupKeyResolverService,
    private readonly suppressionEvaluatorService: SuppressionEvaluatorService,
    private readonly notificationsRepository: NotificationsRepository,
    private readonly lifecycleService: NotificationLifecycleService,
    private readonly templateClientService: TemplateClientService,
    private readonly notificationPublisher: NotificationPublisherService,
    private readonly metricsService: MetricsService,
  ) {}

  async processEvent(event: NormalizedEventMessage): Promise<void> {
    const startTime = process.hrtime.bigint();

    // i. PARSE EVENT
    const {
      eventId,
      correlationId,
      sourceId,
      cycleId,
      eventType,
      priority,
      normalizedPayload,
    } = event;

    const ctx = { correlationId, eventId, eventType, sourceId, cycleId };

    this.logger.log({
      msg: 'Pipeline started',
      ...ctx,
      step: 'parse',
      priority,
    });

    this.metricsService.incrementEventsConsumed(priority, eventType);

    // ii. RULE LOOKUP
    const rules = await this.ruleCacheService.getRulesByEventType(eventType);

    // iii. MATCH RULES
    const ruleEvalStart = process.hrtime.bigint();
    const matchedRules = this.ruleMatcherService.matchFromRules(rules, {
      eventType,
      ...normalizedPayload,
    });
    const ruleEvalSeconds =
      Number(process.hrtime.bigint() - ruleEvalStart) / 1e9;
    this.metricsService.observeRuleEvaluation(ruleEvalSeconds);

    if (matchedRules.length === 0) {
      this.logger.debug({
        msg: 'No matching rules',
        ...ctx,
        step: 'match',
        matchCount: 0,
      });
      this.observeTotal(startTime, priority);
      return;
    }

    for (const rule of matchedRules) {
      this.metricsService.incrementRulesMatched(eventType, rule.id);
    }

    this.logger.debug({
      msg: `Matched ${matchedRules.length} rules`,
      ...ctx,
      step: 'match',
      matchCount: matchedRules.length,
      ruleIds: matchedRules.map((r) => r.id),
    });

    // iv. FOR EACH matched rule, FOR EACH action
    for (const rule of matchedRules) {
      for (const action of rule.actions) {
        try {
          await this.processAction(
            rule,
            action,
            eventId,
            correlationId,
            sourceId,
            cycleId,
            eventType,
            priority,
            normalizedPayload,
          );
        } catch (error) {
          this.logger.error({
            msg: 'Action processing failed',
            ...ctx,
            step: 'action',
            ruleId: rule.id,
            error: (error as Error).message,
          });
        }
      }
    }

    this.observeTotal(startTime, priority);
  }

  private observeTotal(startTime: bigint, priority: string): void {
    const totalSeconds = Number(process.hrtime.bigint() - startTime) / 1e9;
    this.metricsService.observeEventProcessing(priority, totalSeconds);
  }

  private async processAction(
    rule: any,
    action: any,
    eventId: string,
    correlationId: string,
    sourceId: string,
    cycleId: string,
    eventType: string,
    eventPriority: string,
    payload: Record<string, any>,
  ): Promise<void> {
    // v. RESOLVE PRIORITY
    const effectivePriority =
      this.priorityResolverService.resolveEffectivePriority(
        eventPriority,
        rule.deliveryPriority,
      );

    // vi. RESOLVE RECIPIENTS
    const recipients = await this.recipientResolverService.resolveRecipients(
      action,
      payload,
    );

    // vii. FOR EACH recipient
    for (const recipient of recipients) {
      try {
        await this.processRecipient(
          rule,
          action,
          recipient,
          eventId,
          correlationId,
          sourceId,
          cycleId,
          eventType,
          effectivePriority,
          payload,
        );
      } catch (error) {
        this.logger.error({
          msg: 'Recipient processing failed',
          correlationId,
          eventId,
          eventType,
          sourceId,
          cycleId,
          step: 'recipient',
          ruleId: rule.id,
          recipient:
            recipient.email ??
            recipient.phone ??
            recipient.customerId ??
            'unknown',
          error: (error as Error).message,
        });
      }
    }
  }

  private async processRecipient(
    rule: any,
    action: any,
    recipient: any,
    eventId: string,
    correlationId: string,
    sourceId: string,
    cycleId: string,
    eventType: string,
    priority: string,
    payload: Record<string, any>,
  ): Promise<void> {
    // RESOLVE CHANNELS
    const channelResult = await this.channelResolverService.resolveChannels(
      action.channels,
      recipient.customerId ?? null,
      eventType,
    );

    if (channelResult.effectiveChannels.length === 0) {
      this.logger.debug({
        msg: 'All channels preference-filtered',
        correlationId,
        eventId,
        eventType,
        sourceId,
        cycleId,
        step: 'channel-resolve',
        ruleId: rule.id,
        recipient: recipient.email ?? recipient.customerId ?? 'unknown',
      });
      return;
    }

    // viii. FOR EACH channel (parallel — channels are independent)
    const channelPromises = channelResult.effectiveChannels.map((channel) =>
      this.processChannel(
        rule,
        action,
        recipient,
        channel,
        eventId,
        correlationId,
        sourceId,
        cycleId,
        eventType,
        priority,
        payload,
      ),
    );

    const channelResults = await Promise.allSettled(channelPromises);

    for (let i = 0; i < channelResults.length; i++) {
      if (channelResults[i].status === 'rejected') {
        this.logger.error({
          msg: 'Channel processing failed',
          correlationId,
          eventId,
          eventType,
          sourceId,
          cycleId,
          step: 'channel',
          ruleId: rule.id,
          channel: channelResult.effectiveChannels[i],
          error: (channelResults[i] as PromiseRejectedResult).reason?.message,
        });
      }
    }
  }

  private async processChannel(
    rule: any,
    action: any,
    recipient: any,
    channel: string,
    eventId: string,
    correlationId: string,
    sourceId: string,
    cycleId: string,
    eventType: string,
    priority: string,
    payload: Record<string, any>,
  ): Promise<void> {
    const ctx = { correlationId, eventId, eventType, sourceId, cycleId };

    // EVALUATE SUPPRESSION
    let dedupKeyHash: string | null = null;
    let dedupKeyValues: Record<string, any> | null = null;

    if (rule.suppression?.dedupKey && rule.suppression.dedupKey.length > 0) {
      const dedupResult = this.dedupKeyResolverService.resolve(
        rule.suppression.dedupKey,
        { ...payload, eventType },
        recipient,
      );
      dedupKeyHash = dedupResult.hash;
      dedupKeyValues = dedupResult.resolvedValues;
    }

    const suppressionResult = await this.suppressionEvaluatorService.evaluate(
      rule.suppression,
      dedupKeyHash,
      rule.id,
    );

    if (suppressionResult.suppressed) {
      this.logger.debug({
        msg: 'Notification suppressed',
        ...ctx,
        step: 'suppression',
        mode: suppressionResult.reason,
        ruleId: rule.id,
        dedupKeyHash,
        channel,
      });
      this.metricsService.incrementSuppressed(
        suppressionResult.mode ?? suppressionResult.reason ?? 'unknown',
        rule.id,
      );
      this.notificationPublisher.publishStatus(
        eventId,
        'PROCESSING',
        'SUPPRESSED',
        channel,
        { ruleId: rule.id, reason: suppressionResult.reason },
      );
      return;
    }

    // ix. CREATE NOTIFICATION
    const notification = await this.notificationsRepository.createNotification({
      eventId,
      ruleId: rule.id,
      templateId: action.templateId,
      channel,
      status: 'PENDING',
      priority,
      recipientEmail: recipient.email ?? null,
      recipientPhone: recipient.phone ?? null,
      recipientName: recipient.name ?? null,
      customerId: recipient.customerId ?? null,
      dedupKeyHash,
      dedupKeyValues,
      correlationId,
      cycleId,
      sourceId,
      eventType,
    });

    const notificationId = notification.notificationId;
    this.metricsService.incrementNotificationsCreated(channel, priority);

    // TRANSITION to PROCESSING
    await this.lifecycleService.transition(notificationId, 'PROCESSING');

    // x. RENDER TEMPLATE
    const renderStart = process.hrtime.bigint();
    try {
      const renderResult = await this.templateClientService.render(
        action.templateId,
        channel,
        payload,
      );

      const renderSeconds = Number(process.hrtime.bigint() - renderStart) / 1e9;
      this.metricsService.observeTemplateRender(channel, renderSeconds);
      this.metricsService.incrementTemplateRender(channel, 'success');

      this.logger.debug({
        msg: 'Template rendered',
        ...ctx,
        step: 'render',
        channel,
        durationMs: Math.round(renderSeconds * 1000),
        success: true,
        templateId: action.templateId,
        notificationId,
      });

      // TRANSITION to RENDERING — set renderedContent
      await this.lifecycleService.transition(notificationId, 'RENDERING');
      await this.notificationsRepository.updateRenderedContent(notificationId, {
        subject: renderResult.subject,
        body: renderResult.body,
        templateVersion: renderResult.templateVersion,
      });

      if (renderResult.templateVersion) {
        await this.notificationsRepository.updateTemplateVersion(
          notificationId,
          renderResult.templateVersion,
        );
      }
    } catch (error) {
      const renderSeconds = Number(process.hrtime.bigint() - renderStart) / 1e9;
      this.metricsService.observeTemplateRender(channel, renderSeconds);
      this.metricsService.incrementTemplateRender(channel, 'failure');
      this.metricsService.incrementFailed(channel, 'template_render');

      this.logger.error({
        msg: 'Template render failed',
        ...ctx,
        step: 'render',
        channel,
        durationMs: Math.round(renderSeconds * 1000),
        success: false,
        templateId: action.templateId,
        notificationId,
        error: (error as Error).message,
      });

      await this.lifecycleService.transition(notificationId, 'FAILED', {
        errorMessage: `Template render failed: ${(error as Error).message}`,
      });
      return;
    }

    // xi. TRANSITION to DELIVERING
    await this.lifecycleService.transition(notificationId, 'DELIVERING');

    // xii. DISPATCH
    try {
      await this.notificationPublisher.publishToDeliver({
        notificationId,
        eventId,
        ruleId: rule.id,
        channel,
        priority,
        recipient: {
          email: recipient.email,
          phone: recipient.phone,
          deviceToken: recipient.deviceToken,
          name: recipient.name,
          customerId: recipient.customerId,
        },
        content: {
          subject: notification.renderedContent?.subject,
          body: notification.renderedContent?.body ?? '',
          templateVersion: notification.templateVersion ?? undefined,
        },
        media: payload.media,
        metadata: {
          correlationId,
          cycleId,
          sourceId,
          eventType,
          ruleId: rule.id,
        },
      });

      this.metricsService.incrementDispatched(channel, priority);

      this.logger.debug({
        msg: 'Notification dispatched',
        ...ctx,
        step: 'dispatch',
        channel,
        priority,
        notificationId,
      });

      // Optimistic status transition
      await this.lifecycleService.transition(notificationId, 'SENT');
      this.notificationPublisher.publishStatus(
        notificationId,
        'DELIVERING',
        'SENT',
        channel,
        { correlationId, eventType },
      );
    } catch (error) {
      this.metricsService.incrementFailed(channel, 'dispatch');

      this.logger.error({
        msg: 'Dispatch failed',
        ...ctx,
        step: 'dispatch',
        channel,
        priority,
        notificationId,
        error: (error as Error).message,
      });

      await this.lifecycleService.transition(notificationId, 'FAILED', {
        errorMessage: `Dispatch failed: ${(error as Error).message}`,
      });
    }
  }
}
