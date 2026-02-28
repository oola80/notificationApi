import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveryReceipt } from './entities/delivery-receipt.entity.js';
import { DeliveryReceiptsRepository } from './delivery-receipts.repository.js';
import { AuditReceiptsController } from './audit-receipts.controller.js';
import { AuditReceiptsService } from './audit-receipts.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([DeliveryReceipt])],
  controllers: [AuditReceiptsController],
  providers: [DeliveryReceiptsRepository, AuditReceiptsService],
  exports: [DeliveryReceiptsRepository],
})
export class ReceiptsModule {}
