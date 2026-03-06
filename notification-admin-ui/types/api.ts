export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiErrorResponse {
  code: string;
  message: string;
  details: string;
  status: number;
}

export type SortOrder = "ASC" | "DESC";

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface SortParams {
  sortBy?: string;
  sortOrder?: SortOrder;
}

export interface DateRangeParams {
  from?: string;
  to?: string;
}

export type QueryParams = PaginationParams & SortParams & DateRangeParams;
