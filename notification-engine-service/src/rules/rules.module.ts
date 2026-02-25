import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationRule } from './entities/notification-rule.entity.js';
import { NotificationRulesRepository } from './notification-rules.repository.js';
import { NotificationRulesService } from './notification-rules.service.js';
import { NotificationRulesController } from './notification-rules.controller.js';
import { ConditionEvaluatorService } from './rule-engine/condition-evaluator.service.js';
import { RuleMatcherService } from './rule-engine/rule-matcher.service.js';
import { PriorityResolverService } from './rule-engine/priority-resolver.service.js';
import { RuleCacheService } from './rule-cache.service.js';
import { AppRabbitMQModule } from '../rabbitmq/rabbitmq.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationRule]), AppRabbitMQModule],
  controllers: [NotificationRulesController],
  providers: [
    NotificationRulesService,
    NotificationRulesRepository,
    ConditionEvaluatorService,
    RuleMatcherService,
    PriorityResolverService,
    RuleCacheService,
  ],
  exports: [
    NotificationRulesService,
    NotificationRulesRepository,
    ConditionEvaluatorService,
    RuleMatcherService,
    PriorityResolverService,
    RuleCacheService,
  ],
})
export class RulesModule {}
