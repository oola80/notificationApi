import { Injectable, Logger, Optional } from '@nestjs/common';
import Handlebars from 'handlebars';
import { DataSource } from 'typeorm';
import { TemplatesRepository } from '../repositories/templates.repository.js';
import { VariableDetectorService } from './variable-detector.service.js';
import { CreateTemplateDto } from '../dto/create-template.dto.js';
import { UpdateTemplateDto } from '../dto/update-template.dto.js';
import { ListTemplatesQueryDto } from '../dto/list-templates-query.dto.js';
import { RollbackTemplateDto } from '../dto/rollback-template.dto.js';
import { Template } from '../entities/template.entity.js';
import { TemplateVersion } from '../entities/template-version.entity.js';
import { TemplateChannel } from '../entities/template-channel.entity.js';
import { TemplateVariable } from '../entities/template-variable.entity.js';
import { createErrorResponse } from '../../common/errors.js';
import { PaginatedResult } from '../../common/base/pg-base.repository.js';
import { TemplateCacheService } from '../../rendering/services/template-cache.service.js';
import { AuditPublisherService } from '../../rabbitmq/audit-publisher.service.js';
import { MetricsService } from '../../metrics/metrics.service.js';

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly templatesRepository: TemplatesRepository,
    private readonly variableDetector: VariableDetectorService,
    @Optional() private readonly templateCacheService?: TemplateCacheService,
    @Optional() private readonly auditPublisher?: AuditPublisherService,
    @Optional() private readonly metricsService?: MetricsService,
  ) {}

  async create(dto: CreateTemplateDto): Promise<Template> {
    const exists = await this.templatesRepository.existsBySlug(dto.slug);
    if (exists) {
      throw createErrorResponse('TS-002');
    }

    this.validateDuplicateChannels(dto.channels);
    this.validateHandlebarsSyntax(dto.channels);

    return this.dataSource.transaction(async (manager) => {
      const templateRepo = manager.getRepository(Template);
      const versionRepo = manager.getRepository(TemplateVersion);
      const channelRepo = manager.getRepository(TemplateChannel);
      const variableRepo = manager.getRepository(TemplateVariable);

      const template = templateRepo.create({
        slug: dto.slug,
        name: dto.name,
        description: dto.description ?? null,
        createdBy: dto.createdBy ?? null,
        updatedBy: dto.createdBy ?? null,
      });
      const savedTemplate = await templateRepo.save(template);

      const version = versionRepo.create({
        templateId: savedTemplate.id,
        versionNumber: 1,
        changeSummary: 'Initial version',
        createdBy: dto.createdBy ?? null,
      });
      const savedVersion = await versionRepo.save(version);

      const channels = dto.channels.map((ch) =>
        channelRepo.create({
          templateVersionId: savedVersion.id,
          channel: ch.channel,
          subject: ch.subject ?? null,
          body: ch.body,
          metadata: ch.metadata ?? {},
        }),
      );
      const savedChannels = await channelRepo.save(channels);

      savedTemplate.currentVersionId = savedVersion.id;
      await templateRepo.save(savedTemplate);

      const variableNames = this.variableDetector.detectVariables(
        dto.channels.map((ch) => ({ subject: ch.subject, body: ch.body })),
      );

      let savedVariables: TemplateVariable[] = [];
      if (variableNames.length > 0) {
        const variables = variableNames.map((name) =>
          variableRepo.create({
            templateId: savedTemplate.id,
            variableName: name,
          }),
        );
        savedVariables = await variableRepo.save(variables);
      }

      savedVersion.channels = savedChannels;
      savedTemplate.versions = [savedVersion];
      savedTemplate.variables = savedVariables;

      this.logger.log(
        `Template created: ${savedTemplate.id} (${savedTemplate.slug})`,
      );
      this.auditPublisher?.publishTemplateCreated(savedTemplate);
      this.metricsService?.incrementCrudTotal('create');
      this.metricsService?.incrementVersionCreated();
      return savedTemplate;
    });
  }

  async findAll(
    query: ListTemplatesQueryDto,
  ): Promise<PaginatedResult<Template>> {
    return this.templatesRepository.findAllPaginated(query);
  }

  async findById(id: string): Promise<Template> {
    const template =
      await this.templatesRepository.findByIdWithRelations(id);
    if (!template) {
      throw createErrorResponse('TS-009');
    }
    return template;
  }

  async update(id: string, dto: UpdateTemplateDto): Promise<Template> {
    const template = await this.templatesRepository.findById(id);
    if (!template) {
      throw createErrorResponse('TS-009');
    }

    this.validateDuplicateChannels(dto.channels);
    this.validateHandlebarsSyntax(dto.channels);

    await this.dataSource.transaction(async (manager) => {
      const templateRepo = manager.getRepository(Template);
      const versionRepo = manager.getRepository(TemplateVersion);
      const channelRepo = manager.getRepository(TemplateChannel);
      const variableRepo = manager.getRepository(TemplateVariable);

      const maxResult = await versionRepo
        .createQueryBuilder('v')
        .where('v.template_id = :templateId', { templateId: id })
        .select('COALESCE(MAX(v.version_number), 0)', 'maxVersion')
        .getRawOne();
      const nextVersion = (maxResult?.maxVersion ?? 0) + 1;

      const version = versionRepo.create({
        templateId: id,
        versionNumber: nextVersion,
        changeSummary: dto.changeSummary,
        createdBy: dto.updatedBy ?? null,
      });
      const savedVersion = await versionRepo.save(version);

      const channels = dto.channels.map((ch) =>
        channelRepo.create({
          templateVersionId: savedVersion.id,
          channel: ch.channel,
          subject: ch.subject ?? null,
          body: ch.body,
          metadata: ch.metadata ?? {},
        }),
      );
      await channelRepo.save(channels);

      template.currentVersionId = savedVersion.id;
      template.updatedBy = dto.updatedBy ?? null;
      await templateRepo.save(template);

      const variableNames = this.variableDetector.detectVariables(
        dto.channels.map((ch) => ({ subject: ch.subject, body: ch.body })),
      );

      const existingVars = await variableRepo.find({
        where: { templateId: id },
      });
      const existingMap = new Map(
        existingVars.map((v) => [v.variableName, v]),
      );
      const toKeep = new Set(variableNames);

      const toRemove = existingVars.filter(
        (v) => !toKeep.has(v.variableName),
      );
      if (toRemove.length > 0) {
        await variableRepo.remove(toRemove);
      }

      const toAdd = variableNames.filter((name) => !existingMap.has(name));
      if (toAdd.length > 0) {
        const newVars = toAdd.map((name) =>
          variableRepo.create({ templateId: id, variableName: name }),
        );
        await variableRepo.save(newVars);
      }

      this.logger.log(`Template updated: ${id} → version ${nextVersion}`);
      this.metricsService?.incrementVersionCreated();
    });

    this.templateCacheService?.invalidate(id);
    this.metricsService?.incrementCrudTotal('update');

    const updated =
      await this.templatesRepository.findByIdWithRelations(id);
    this.auditPublisher?.publishTemplateUpdated(
      updated!,
      updated!.versions?.[0]?.versionNumber ?? 0,
    );
    return updated!;
  }

  async delete(id: string): Promise<Template> {
    const template = await this.templatesRepository.findById(id);
    if (!template) {
      throw createErrorResponse('TS-009');
    }

    template.isActive = false;
    const saved = await this.templatesRepository.save(template);
    this.templateCacheService?.invalidate(id);
    this.auditPublisher?.publishTemplateDeleted(id);
    this.metricsService?.incrementCrudTotal('delete');
    this.logger.log(`Template soft-deleted: ${id}`);
    return saved;
  }

  async rollback(id: string, dto: RollbackTemplateDto): Promise<Template> {
    const template = await this.templatesRepository.findByIdWithRelations(id);
    if (!template) {
      throw createErrorResponse('TS-009');
    }

    const targetVersion = template.versions?.find(
      (v) => v.versionNumber === dto.versionNumber,
    );
    if (!targetVersion) {
      throw createErrorResponse(
        'TS-011',
        `Version ${dto.versionNumber} does not exist for this template`,
      );
    }

    if (template.currentVersionId === targetVersion.id) {
      throw createErrorResponse(
        'TS-011',
        `Template is already at version ${dto.versionNumber}`,
      );
    }

    const currentVersion = template.versions?.find(
      (v) => v.id === template.currentVersionId,
    );
    const fromVersion = currentVersion?.versionNumber ?? 0;

    template.currentVersionId = targetVersion.id;
    template.updatedBy = dto.updatedBy ?? null;
    await this.templatesRepository.save(template);

    this.templateCacheService?.invalidate(id);
    this.auditPublisher?.publishTemplateRolledback(
      template,
      fromVersion,
      dto.versionNumber,
    );
    this.metricsService?.incrementCrudTotal('rollback');
    this.logger.log(
      `Template rolled back: ${id} from v${fromVersion} to v${dto.versionNumber}`,
    );

    const updated =
      await this.templatesRepository.findByIdWithRelations(id);
    return updated!;
  }

  private validateDuplicateChannels(
    channels: { channel: string }[],
  ): void {
    const seen = new Set<string>();
    for (const ch of channels) {
      if (seen.has(ch.channel)) {
        throw createErrorResponse(
          'TS-003',
          `Duplicate channel: ${ch.channel}`,
        );
      }
      seen.add(ch.channel);
    }
  }

  private validateHandlebarsSyntax(
    channels: { channel: string; subject?: string; body: string }[],
  ): void {
    for (const ch of channels) {
      if (ch.subject) {
        try {
          Handlebars.precompile(ch.subject);
        } catch (error) {
          throw createErrorResponse(
            'TS-003',
            `Invalid Handlebars syntax in ${ch.channel} subject: ${(error as Error).message}`,
          );
        }
      }

      try {
        Handlebars.precompile(ch.body);
      } catch (error) {
        throw createErrorResponse(
          'TS-003',
          `Invalid Handlebars syntax in ${ch.channel} body: ${(error as Error).message}`,
        );
      }
    }
  }
}
