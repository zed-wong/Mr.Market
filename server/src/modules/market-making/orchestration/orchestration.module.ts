import { Module } from '@nestjs/common';
import { WithdrawalModule } from 'src/modules/mixin/withdrawal/withdrawal.module';

import { ExecutionModule } from '../execution/execution.module';
import { LedgerModule } from '../ledger/ledger.module';
import { StrategyModule } from '../strategy/strategy.module';
import { TrackersModule } from '../trackers/trackers.module';
import { PauseWithdrawOrchestratorService } from './pause-withdraw-orchestrator.service';

@Module({
  imports: [
    StrategyModule,
    LedgerModule,
    WithdrawalModule,
    TrackersModule,
    ExecutionModule,
  ],
  providers: [PauseWithdrawOrchestratorService],
  exports: [PauseWithdrawOrchestratorService],
})
export class OrchestrationModule {}
