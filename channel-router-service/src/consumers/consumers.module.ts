import { Module } from '@nestjs/common';
import { AppRabbitMQModule } from '../rabbitmq/rabbitmq.module.js';
import { DeliveryModule } from '../delivery/delivery.module.js';
import { EmailCriticalConsumer } from './email-critical.consumer.js';
import { EmailNormalConsumer } from './email-normal.consumer.js';
import { SmsCriticalConsumer } from './sms-critical.consumer.js';
import { SmsNormalConsumer } from './sms-normal.consumer.js';
import { WhatsappCriticalConsumer } from './whatsapp-critical.consumer.js';
import { WhatsappNormalConsumer } from './whatsapp-normal.consumer.js';
import { PushCriticalConsumer } from './push-critical.consumer.js';
import { PushNormalConsumer } from './push-normal.consumer.js';

@Module({
  imports: [AppRabbitMQModule, DeliveryModule],
  providers: [
    EmailCriticalConsumer,
    EmailNormalConsumer,
    SmsCriticalConsumer,
    SmsNormalConsumer,
    WhatsappCriticalConsumer,
    WhatsappNormalConsumer,
    PushCriticalConsumer,
    PushNormalConsumer,
  ],
})
export class ConsumersModule {}
