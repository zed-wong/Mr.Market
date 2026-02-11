import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { StrategyModule } from '../strategy/strategy.module';
import { PauseWithdrawOrchestratorService } from './pause-withdraw-orchestrator.service';
import { WithdrawalModule } from 'src/modules/mixin/withdrawal/withdrawal.module';
import { TrackersModule } from '../trackers/trackers.module';
import { ExecutionModule } from '../execution/execution.module';

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
