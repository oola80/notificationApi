export interface ErrorResponse {
  code: string;
  details: string;
  message: string;
  status: number;
  stack?: string;
}
