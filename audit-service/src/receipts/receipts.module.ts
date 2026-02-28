import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveryReceipt } from './entities/delivery-receipt.entity.js';
import { DeliveryReceiptsRepository } from './delivery-receipts.repository.js';

@Module({
  imports: [TypeOrmModule.forFeature([DeliveryReceipt])],
  providers: [DeliveryReceiptsRepository],
  exports: [DeliveryReceiptsRepository],
})
export class ReceiptsModule {}
