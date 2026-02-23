import {
  Repository,
  FindOptionsWhere,
  FindOptionsOrder,
  ObjectLiteral,
} from 'typeorm';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface PaginationOptions<T extends ObjectLiteral> {
  where?: FindOptionsWhere<T> | FindOptionsWhere<T>[];
  page?: number;
  limit?: number;
  order?: FindOptionsOrder<T>;
}

export abstract class PgBaseRepository<T extends ObjectLiteral> {
  constructor(protected readonly repository: Repository<T>) {}

  async findById(id: any): Promise<T | null> {
    return this.repository.findOne({ where: { id } as FindOptionsWhere<T> });
  }

  async findWithPagination(
    options: PaginationOptions<T>,
  ): Promise<PaginatedResult<T>> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 50;
    const skip = (page - 1) * limit;

    const [data, total] = await this.repository.findAndCount({
      where: options.where,
      order: options.order,
      skip,
      take: limit,
    });

    return { data, total, page, limit };
  }
}
