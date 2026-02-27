import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdapterClientService } from '../adapter-client/adapter-client.service.js';
import { ProviderConfigsRepository } from '../providers/provider-configs.repository.js';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service.js';
import { MetricsService } from '../metrics/metrics.service.js';

export interface AdapterHealthStatus {
  providerId: string;
  providerName: string;
  adapterUrl: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastCheckAt: string | null;
}

@Injectable()
export class AdapterHealthMonitorService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AdapterHealthMonitorService.name);
  private readonly healthStatus = new Map<string, AdapterHealthStatus>();
  private intervalRef: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly adapterClientService: AdapterClientService,
    private readonly providerConfigsRepo: ProviderConfigsRepository,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly metricsService: MetricsService,
  ) {
    this.intervalMs = this.configService.get<number>(
      'app.adapterHealthCheckIntervalMs',
      30000,
    );
  }

  onModuleInit(): void {
    setTimeout(() => void this.checkAllAdapters(), 5000);
    this.intervalRef = setInterval(
      () => void this.checkAllAdapters(),
      this.intervalMs,
    );
    this.logger.log(
      `Adapter health monitor started (interval: ${this.intervalMs}ms)`,
    );
  }

  onModuleDestroy(): void {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
    this.logger.log('Adapter health monitor stopped');
  }

  async checkAllAdapters(): Promise<void> {
    const channels = ['email', 'sms', 'whatsapp', 'push'];
    const seen = new Set<string>();

    for (const channel of channels) {
      const providers =
        await this.providerConfigsRepo.findActiveByChannel(channel);
      for (const provider of providers) {
        if (seen.has(provider.id)) continue;
        seen.add(provider.id);
        await this.checkAdapter(provider);
      }
    }
  }

  private async checkAdapter(provider: {
    id: string;
    providerName: string;
    adapterUrl: string;
  }): Promise<void> {
    try {
      const healthResponse = await this.adapterClientService.checkHealth(
        provider.adapterUrl,
      );

      const isHealthy =
        healthResponse.status === 'ok' || healthResponse.status === 'healthy';
      if (isHealthy) {
        this.circuitBreakerService.recordSuccess(provider.id);
        this.updateStatus(provider, 'healthy');
      } else {
        this.circuitBreakerService.recordHealthCheckFailure(provider.id);
        this.metricsService.incrementAdapterUnavailable(provider.providerName);
        this.updateStatus(provider, 'unhealthy');
      }
    } catch {
      this.circuitBreakerService.recordHealthCheckFailure(provider.id);
      this.metricsService.incrementAdapterUnavailable(provider.providerName);
      this.updateStatus(provider, 'unhealthy');
    }

    this.updateLastHealthCheck(provider.id);
  }

  private updateStatus(
    provider: { id: string; providerName: string; adapterUrl: string },
    status: 'healthy' | 'unhealthy',
  ): void {
    this.healthStatus.set(provider.id, {
      providerId: provider.id,
      providerName: provider.providerName,
      adapterUrl: provider.adapterUrl,
      status,
      lastCheckAt: new Date().toISOString(),
    });
  }

  private updateLastHealthCheck(providerId: string): void {
    this.providerConfigsRepo
      .findById(providerId)
      .then((provider) => {
        if (provider) {
          provider.lastHealthCheck = new Date();
          return this.providerConfigsRepo.save(provider);
        }
      })
      .catch((err) => {
        this.logger.error(
          `Failed to update lastHealthCheck for provider ${providerId}`,
          (err as Error).message,
        );
      });
  }

  getHealthStatus(): Map<string, AdapterHealthStatus> {
    return new Map(this.healthStatus);
  }
}
