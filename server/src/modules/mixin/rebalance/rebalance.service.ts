import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import BigNumber from 'bignumber.js';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { ExchangeService } from 'src/modules/mixin/exchange/exchange.service';
import { RebalanceRepository } from 'src/modules/mixin/rebalance/rebalance.repository';
import { SnapshotsService } from 'src/modules/mixin/snapshots/snapshots.service';

@Injectable()
export class RebalanceService {
  private readonly logger = new CustomLogger(RebalanceService.name);

  constructor(
    private configService: ConfigService,
    private exchangeService: ExchangeService,
    private snapshotService: SnapshotsService,
    private rebalanceRepository: RebalanceRepository,
  ) {}

  @Cron('*/60 * * * * *')
  async rebalance() {}

  private async rebalanceFromExchangeToMixin(
    assetId: string,
    symbol: string,
    mixinAmount: BigNumber,
    minAmount: BigNumber,
    allBalanceByExchange: any,
  ) {}

  private async rebalanceFromMixinToExchange(
    symbol: string,
    balance: BigNumber.Value,
    exchange: string,
    mixinBalance: BigNumber.Value,
  ) {}
}
