import { AdapterHealthResponseDto } from '../dto/health-response.dto.js';

export abstract class BaseHealthService {
  abstract getProviderId(): string;
  abstract getProviderName(): string;
  abstract getSupportedChannels(): string[];
  abstract checkProviderConnectivity(): Promise<{
    ok: boolean;
    latencyMs: number;
    details: Record<string, any>;
  }>;

  async getHealth(): Promise<AdapterHealthResponseDto> {
    const connectivity = await this.checkProviderConnectivity();

    let status: 'ok' | 'degraded' | 'down';
    if (connectivity.ok && connectivity.latencyMs < 5000) {
      status = 'ok';
    } else if (connectivity.ok) {
      status = 'degraded';
    } else {
      status = 'down';
    }

    return {
      status,
      providerId: this.getProviderId(),
      providerName: this.getProviderName(),
      supportedChannels: this.getSupportedChannels(),
      latencyMs: connectivity.latencyMs,
      details: connectivity.details,
    };
  }
}
