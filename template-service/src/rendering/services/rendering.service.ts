import {
  Injectable,
  Logger,
  Optional,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import Handlebars from 'handlebars';
import { Template } from '../../templates/entities/template.entity.js';
import { TemplateVersion } from '../../templates/entities/template-version.entity.js';
import { TemplateChannel } from '../../templates/entities/template-channel.entity.js';
import { TemplateVariable } from '../../templates/entities/template-variable.entity.js';
import { TemplateCacheService } from './template-cache.service.js';
import { MetricsService } from '../../metrics/metrics.service.js';
import { AuditPublisherService } from '../../rabbitmq/audit-publisher.service.js';
import { RenderTemplateDto } from '../dto/render-template.dto.js';
import { PreviewTemplateDto } from '../dto/preview-template.dto.js';
import { createErrorResponse } from '../../common/errors.js';
import { registerHandlebarsHelpers } from '../helpers/handlebars-helpers.js';
import {
  sanitizeEmailHtml,
  sanitizeTextContent,
} from '../sanitizers/html-sanitizer.js';

@Injectable()
export class RenderingService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RenderingService.name);
  private helpersRegistered = false;

  constructor(
    @InjectRepository(Template)
    private readonly templateRepo: Repository<Template>,
    @InjectRepository(TemplateVersion)
    private readonly versionRepo: Repository<TemplateVersion>,
    @InjectRepository(TemplateChannel)
    private readonly channelRepo: Repository<TemplateChannel>,
    @InjectRepository(TemplateVariable)
    private readonly variableRepo: Repository<TemplateVariable>,
    private readonly cacheService: TemplateCacheService,
    private readonly metricsService: MetricsService,
    private readonly configService: ConfigService,
    @Optional() private readonly auditPublisher?: AuditPublisherService,
  ) {
    this.registerHelpers();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.warmUp();
  }

  async render(
    templateId: string,
    dto: RenderTemplateDto,
  ): Promise<{
    rendered: { subject?: string; body: string };
    metadata: {
      templateId: string;
      versionNumber: number;
      channel: string;
      renderedAt: string;
      renderDurationMs: number;
    };
    channelMetadata: Record<string, any>;
    warnings: string[];
  }> {
    const startTime = process.hrtime.bigint();
    const channel = dto.channel;
    const renderTimeoutMs = this.configService.get<number>(
      'app.renderTimeoutMs',
      5000,
    );

    try {
      const template = await this.templateRepo.findOne({
        where: { id: templateId },
      });
      if (!template) {
        throw createErrorResponse('TS-009');
      }
      if (!template.isActive) {
        throw createErrorResponse('TS-004');
      }

      if (this.elapsedMs(startTime) > renderTimeoutMs) {
        throw createErrorResponse('TS-012');
      }

      const { version, versionId } = await this.resolveVersion(
        templateId,
        dto.versionNumber,
        template.currentVersionId,
      );

      if (this.elapsedMs(startTime) > renderTimeoutMs) {
        throw createErrorResponse('TS-012');
      }

      const cacheKey = `${templateId}:${versionId}:${channel}`;
      let compiled = this.cacheService.get(cacheKey);

      if (!compiled) {
        const channelContent = await this.channelRepo.findOne({
          where: { templateVersionId: versionId, channel },
        });
        if (!channelContent) {
          throw createErrorResponse(
            'TS-009',
            `Channel '${channel}' not found for this template version`,
          );
        }

        compiled = {
          subjectFn: channelContent.subject
            ? Handlebars.compile(channelContent.subject)
            : null,
          bodyFn: Handlebars.compile(channelContent.body),
          channelMetadata: channelContent.metadata ?? {},
        };
        this.cacheService.set(cacheKey, compiled);
      }

      if (this.elapsedMs(startTime) > renderTimeoutMs) {
        throw createErrorResponse('TS-012');
      }

      await this.validateRequiredVariables(templateId, dto.data);

      if (this.elapsedMs(startTime) > renderTimeoutMs) {
        throw createErrorResponse('TS-012');
      }

      let subject: string | undefined;
      let body: string;

      try {
        subject = compiled.subjectFn
          ? compiled.subjectFn(dto.data)
          : undefined;
        body = compiled.bodyFn(dto.data);
      } catch (error) {
        throw createErrorResponse(
          'TS-005',
          `Template rendering failed: ${(error as Error).message}`,
        );
      }

      if (this.elapsedMs(startTime) > renderTimeoutMs) {
        throw createErrorResponse('TS-012');
      }

      if (channel === 'email') {
        body = sanitizeEmailHtml(body);
        if (subject !== undefined) subject = sanitizeTextContent(subject);
      }

      const warnings = this.checkOutputLimits(channel, subject, body);

      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1_000_000;
      const durationSeconds = durationMs / 1000;

      this.metricsService.observeRenderDuration(channel, durationSeconds);
      this.metricsService.incrementRenderTotal(channel, 'success');
      this.auditPublisher?.publishRenderCompleted(
        templateId,
        channel,
        version.versionNumber,
        Math.round(durationMs * 100) / 100,
      );

      return {
        rendered: {
          ...(subject !== undefined && { subject }),
          body,
        },
        metadata: {
          templateId,
          versionNumber: version.versionNumber,
          channel,
          renderedAt: new Date().toISOString(),
          renderDurationMs: Math.round(durationMs * 100) / 100,
        },
        channelMetadata: compiled.channelMetadata,
        warnings,
      };
    } catch (error) {
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1_000_000;
      const durationSeconds = durationMs / 1000;

      this.metricsService.observeRenderDuration(channel, durationSeconds);
      this.metricsService.incrementRenderTotal(channel, 'error');
      this.auditPublisher?.publishRenderFailed(
        templateId,
        channel,
        (error as Error).message,
      );

      throw error;
    }
  }

  async preview(
    templateId: string,
    dto: PreviewTemplateDto,
  ): Promise<{
    previews: {
      channel: string;
      subject?: string;
      body: string;
      warnings: string[];
    }[];
    metadata: {
      templateId: string;
      versionNumber: number;
      renderedAt: string;
    };
  }> {
    const template = await this.templateRepo.findOne({
      where: { id: templateId },
    });
    if (!template) {
      throw createErrorResponse('TS-009');
    }
    if (!template.isActive) {
      throw createErrorResponse('TS-004');
    }

    const { version, versionId } = await this.resolveVersion(
      templateId,
      dto.versionNumber,
      template.currentVersionId,
    );

    const channels = await this.channelRepo.find({
      where: { templateVersionId: versionId },
    });

    const previews: {
      channel: string;
      subject?: string;
      body: string;
      warnings: string[];
    }[] = [];

    for (const ch of channels) {
      const cacheKey = `${templateId}:${versionId}:${ch.channel}`;
      let compiled = this.cacheService.get(cacheKey);

      if (!compiled) {
        compiled = {
          subjectFn: ch.subject ? Handlebars.compile(ch.subject) : null,
          bodyFn: Handlebars.compile(ch.body),
          channelMetadata: ch.metadata ?? {},
        };
        this.cacheService.set(cacheKey, compiled);
      }

      try {
        let subject = compiled.subjectFn
          ? compiled.subjectFn(dto.data)
          : undefined;
        let body = compiled.bodyFn(dto.data);

        if (ch.channel === 'email') {
          body = sanitizeEmailHtml(body);
          if (subject !== undefined) subject = sanitizeTextContent(subject);
        }

        const warnings = this.checkOutputLimits(ch.channel, subject, body);

        previews.push({
          channel: ch.channel,
          ...(subject !== undefined && { subject }),
          body,
          warnings,
        });
      } catch {
        previews.push({
          channel: ch.channel,
          body: `[Render error for channel ${ch.channel}]`,
          warnings: [`Failed to render ${ch.channel} channel`],
        });
      }
    }

    return {
      previews,
      metadata: {
        templateId,
        versionNumber: version.versionNumber,
        renderedAt: new Date().toISOString(),
      },
    };
  }

  async warmUp(): Promise<void> {
    try {
      const templates = await this.templateRepo.find({
        where: { isActive: true },
      });

      let count = 0;

      for (const template of templates) {
        if (!template.currentVersionId) continue;

        const channels = await this.channelRepo.find({
          where: { templateVersionId: template.currentVersionId },
        });

        for (const ch of channels) {
          const cacheKey = `${template.id}:${template.currentVersionId}:${ch.channel}`;
          const compiled = {
            subjectFn: ch.subject
              ? Handlebars.compile(ch.subject)
              : null,
            bodyFn: Handlebars.compile(ch.body),
            channelMetadata: ch.metadata ?? {},
          };
          this.cacheService.set(cacheKey, compiled);
          count++;
        }
      }

      this.logger.log(
        `Template cache warmed up: ${count} entries pre-compiled`,
      );
    } catch (error) {
      this.logger.warn(
        `Template cache warm-up failed: ${(error as Error).message}`,
      );
    }
  }

  private async resolveVersion(
    templateId: string,
    versionNumber: number | undefined,
    currentVersionId: string | null,
  ): Promise<{ version: TemplateVersion; versionId: string }> {
    if (versionNumber !== undefined) {
      const version = await this.versionRepo.findOne({
        where: { templateId, versionNumber },
      });
      if (!version) {
        throw createErrorResponse('TS-010');
      }
      return { version, versionId: version.id };
    }

    if (!currentVersionId) {
      throw createErrorResponse(
        'TS-009',
        'Template has no current version',
      );
    }

    const version = await this.versionRepo.findOne({
      where: { id: currentVersionId },
    });
    if (!version) {
      throw createErrorResponse('TS-010');
    }
    return { version, versionId: version.id };
  }

  private async validateRequiredVariables(
    templateId: string,
    data: Record<string, any>,
  ): Promise<void> {
    const requiredVars = await this.variableRepo.find({
      where: { templateId, isRequired: true },
    });

    const missing = requiredVars.filter(
      (v) => !(v.variableName in data),
    );

    if (missing.length > 0) {
      const names = missing.map((v) => v.variableName).join(', ');
      throw createErrorResponse(
        'TS-006',
        `Missing required template variables: ${names}`,
      );
    }
  }

  private checkOutputLimits(
    channel: string,
    subject: string | undefined,
    body: string,
  ): string[] {
    const warnings: string[] = [];
    const smsWarnLength = this.configService.get<number>(
      'app.smsWarnLength',
      160,
    );
    const smsMaxLength = this.configService.get<number>(
      'app.smsMaxLength',
      1600,
    );
    const whatsappMaxLength = this.configService.get<number>(
      'app.whatsappMaxLength',
      4096,
    );
    const pushMaxLength = this.configService.get<number>(
      'app.pushMaxLength',
      256,
    );

    switch (channel) {
      case 'sms':
        if (body.length > smsMaxLength) {
          warnings.push(
            `SMS body exceeds maximum length of ${smsMaxLength} characters (${body.length} chars). Message will likely be rejected.`,
          );
        } else if (body.length > smsWarnLength) {
          warnings.push(
            `SMS body exceeds ${smsWarnLength} characters (${body.length} chars). Message may be split into multiple segments.`,
          );
        }
        break;
      case 'whatsapp':
        if (body.length > whatsappMaxLength) {
          warnings.push(
            `WhatsApp body exceeds maximum length of ${whatsappMaxLength} characters (${body.length} chars).`,
          );
        }
        break;
      case 'push':
        {
          const totalLength = (subject ?? '').length + body.length;
          if (totalLength > pushMaxLength) {
            warnings.push(
              `Push notification content exceeds ${pushMaxLength} characters (${totalLength} chars). Content may be truncated.`,
            );
          }
        }
        break;
    }

    return warnings;
  }

  private elapsedMs(startTime: bigint): number {
    return Number(process.hrtime.bigint() - startTime) / 1_000_000;
  }

  private registerHelpers(): void {
    if (!this.helpersRegistered) {
      registerHandlebarsHelpers();
      this.helpersRegistered = true;
    }
  }
}
