import { TemplateVariablesRepository } from './template-variables.repository.js';
import { TemplateVariable } from '../entities/template-variable.entity.js';

describe('TemplateVariablesRepository', () => {
  let repository: TemplateVariablesRepository;
  let mockTypeOrmRepo: any;

  const templateId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    mockTypeOrmRepo = {
      find: jest.fn(),
      create: jest.fn((data: any) => {
        if (Array.isArray(data))
          return data.map((d) => ({ id: 'var-id', ...d }));
        return { id: 'var-id', ...data };
      }),
      save: jest.fn((entities: any) => {
        if (Array.isArray(entities))
          return Promise.resolve(entities.map((e: any) => ({ ...e })));
        return Promise.resolve({ ...entities });
      }),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    repository = new TemplateVariablesRepository(mockTypeOrmRepo);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('upsertForTemplate', () => {
    it('should add new variables when none exist', async () => {
      mockTypeOrmRepo.find
        .mockResolvedValueOnce([]) // existing = none
        .mockResolvedValueOnce([
          { id: 'v1', templateId, variableName: 'name' },
          { id: 'v2', templateId, variableName: 'orderId' },
        ]); // final state

      const result = await repository.upsertForTemplate(templateId, [
        'name',
        'orderId',
      ]);

      expect(mockTypeOrmRepo.remove).not.toHaveBeenCalled();
      expect(mockTypeOrmRepo.create).toHaveBeenCalledWith([
        { templateId, variableName: 'name' },
        { templateId, variableName: 'orderId' },
      ]);
      expect(mockTypeOrmRepo.save).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    it('should remove stale variables and keep existing', async () => {
      const existing: Partial<TemplateVariable>[] = [
        { id: 'v1', templateId, variableName: 'oldVar' },
        { id: 'v2', templateId, variableName: 'keepVar' },
      ];
      mockTypeOrmRepo.find
        .mockResolvedValueOnce(existing) // existing
        .mockResolvedValueOnce([
          { id: 'v2', templateId, variableName: 'keepVar' },
          { id: 'v3', templateId, variableName: 'newVar' },
        ]); // final state

      const result = await repository.upsertForTemplate(templateId, [
        'keepVar',
        'newVar',
      ]);

      expect(mockTypeOrmRepo.remove).toHaveBeenCalledWith([existing[0]]);
      expect(mockTypeOrmRepo.create).toHaveBeenCalledWith([
        { templateId, variableName: 'newVar' },
      ]);
      expect(result).toHaveLength(2);
    });

    it('should handle empty variableNames (removes all existing)', async () => {
      const existing: Partial<TemplateVariable>[] = [
        { id: 'v1', templateId, variableName: 'oldVar' },
      ];
      mockTypeOrmRepo.find
        .mockResolvedValueOnce(existing) // existing
        .mockResolvedValueOnce([]); // final state

      const result = await repository.upsertForTemplate(templateId, []);

      expect(mockTypeOrmRepo.remove).toHaveBeenCalledWith(existing);
      expect(mockTypeOrmRepo.save).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should return final state sorted by variableName', async () => {
      mockTypeOrmRepo.find
        .mockResolvedValueOnce([]) // existing
        .mockResolvedValueOnce([
          { id: 'v1', templateId, variableName: 'alpha' },
          { id: 'v2', templateId, variableName: 'beta' },
        ]); // final state

      const result = await repository.upsertForTemplate(templateId, [
        'alpha',
        'beta',
      ]);

      expect(mockTypeOrmRepo.find).toHaveBeenLastCalledWith({
        where: { templateId },
        order: { variableName: 'ASC' },
      });
      expect(result[0].variableName).toBe('alpha');
      expect(result[1].variableName).toBe('beta');
    });
  });

  describe('findByTemplateId', () => {
    it('should return variables ordered by variableName ASC', async () => {
      const mockVars = [
        { id: 'v1', templateId, variableName: 'amount' },
        { id: 'v2', templateId, variableName: 'name' },
      ];
      mockTypeOrmRepo.find.mockResolvedValue(mockVars);

      const result = await repository.findByTemplateId(templateId);

      expect(result).toEqual(mockVars);
      expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
        where: { templateId },
        order: { variableName: 'ASC' },
      });
    });

    it('should return empty array when none found', async () => {
      mockTypeOrmRepo.find.mockResolvedValue([]);

      const result = await repository.findByTemplateId(templateId);

      expect(result).toEqual([]);
    });
  });
});
