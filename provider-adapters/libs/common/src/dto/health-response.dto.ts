export class AdapterHealthResponseDto {
  status: 'ok' | 'degraded' | 'down';
  providerId: string;
  providerName: string;
  supportedChannels: string[];
  latencyMs: number;
  details: Record<string, any>;
}
