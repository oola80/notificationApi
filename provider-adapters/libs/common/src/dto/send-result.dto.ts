export class SendResultDto {
  success: boolean;
  providerMessageId: string | null;
  retryable: boolean;
  errorMessage: string | null;
  httpStatus: number;
  providerResponse: any | null;
}
