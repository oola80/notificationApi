import { NotificationAnalytics } from './notification-analytics.entity';

describe('NotificationAnalytics Entity', () => {
  it('should create an instance with all properties', () => {
    const analytics = new NotificationAnalytics();
    analytics.id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    analytics.period = 'hourly';
    analytics.periodStart = new Date('2026-02-20T10:00:00Z');
    analytics.channel = 'email';
    analytics.eventType = 'order.shipped';
    analytics.totalSent = 100;
    analytics.totalDelivered = 95;
    analytics.totalFailed = 3;
    analytics.totalOpened = 50;
    analytics.totalClicked = 20;
    analytics.totalBounced = 2;
    analytics.totalSuppressed = 5;
    analytics.avgLatencyMs = 1180.25;

    expect(analytics.period).toBe('hourly');
    expect(analytics.channel).toBe('email');
    expect(analytics.totalSent).toBe(100);
    expect(analytics.totalDelivered).toBe(95);
    expect(analytics.avgLatencyMs).toBe(1180.25);
  });

  it('should allow event_type and avg_latency_ms to be null', () => {
    const analytics = new NotificationAnalytics();
    analytics.period = 'daily';
    analytics.periodStart = new Date();
    analytics.channel = '_all';

    expect(analytics.eventType).toBeUndefined();
    expect(analytics.avgLatencyMs).toBeUndefined();
  });
});
