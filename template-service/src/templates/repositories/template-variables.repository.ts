import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TemplateVariable } from '../entities/template-variable.entity.js';

@Injectable()
export class TemplateVariablesRepository {
  constructor(
    @InjectRepository(TemplateVariable)
    private readonly repository: Repository<TemplateVariable>,
  ) {}

  async upsertForTemplate(
    templateId: string,
    variableNames: string[],
  ): Promise<TemplateVariable[]> {
    const existing = await this.repository.find({ where: { templateId } });
    const existingMap = new Map(existing.map((v) => [v.variableName, v]));
    const toKeep = new Set(variableNames);

    const toRemove = existing.filter((v) => !toKeep.has(v.variableName));
    if (toRemove.length > 0) {
      await this.repository.remove(toRemove);
    }

    const toAdd = variableNames.filter((name) => !existingMap.has(name));
    if (toAdd.length > 0) {
      const entities = this.repository.create(
        toAdd.map((name) => ({ templateId, variableName: name })),
      );
      await this.repository.save(entities);
    }

    return this.repository.find({
      where: { templateId },
      order: { variableName: 'ASC' },
    });
  }

  async findByTemplateId(templateId: string): Promise<TemplateVariable[]> {
    return this.repository.find({
      where: { templateId },
      order: { variableName: 'ASC' },
    });
  }
}
