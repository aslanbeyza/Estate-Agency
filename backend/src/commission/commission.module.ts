import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommissionPolicyService } from './commission.policy';
import { CommissionService } from './commission.service';

@Module({
  imports: [ConfigModule],
  providers: [CommissionPolicyService, CommissionService],
  exports: [CommissionService, CommissionPolicyService],
})
export class CommissionModule {}
