import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommissionModule } from '../commission/commission.module';
import { Agent, AgentSchema } from '../agents/agent.schema';
import { Transaction, TransactionSchema } from './transaction.schema';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Transaction.name, schema: TransactionSchema },
      // Registered here (not imported from AgentsModule) so TransactionsService
      // can validate agent references at create time — including the soft-delete
      // guard — without introducing a circular service dependency.
      { name: Agent.name, schema: AgentSchema },
    ]),
    CommissionModule,
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
