import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import {
  LedgerEntry,
  LedgerEntryType,
} from 'src/common/entities/ledger/ledger-entry.entity';
import { MarketMakingOrderBalance } from 'src/common/entities/ledger/market-making-order-balance.entity';
import { MarketMakingOrder } from 'src/common/entities/orders/user-orders.entity';
import { UserOrdersService } from 'src/modules/market-making/user-orders/user-orders.service';
import { In, Repository } from 'typeorm';

const WEB3_BALANCES_NAMESPACE = '/web3/balances';
const WEB3_WALLET_ORDER_PREFIX = 'web3:wallet';
const FUNDING_ACTIVITY_TYPES: LedgerEntryType[] = [
  'deposit_credit',
  'withdraw_debit',
];

type SerializedBalance = {
  orderId: string;
  assetId: string;
  available: string;
  locked: string;
  total: string;
  initialDeposit: string;
  realizedDelta: string;
  feePaid: string;
  updatedAt: string;
};

type MarketMakingBalanceGroup = {
  assetId: string;
  available: string;
  locked: string;
  total: string;
  orderCount: number;
  orders: SerializedBalance[];
};

@Injectable()
export class Web3BalancesService {
  constructor(
    @InjectRepository(MarketMakingOrderBalance)
    private readonly orderBalanceRepository: Repository<MarketMakingOrderBalance>,
    @InjectRepository(LedgerEntry)
    private readonly ledgerEntryRepository: Repository<LedgerEntry>,
    private readonly userOrdersService: UserOrdersService,
  ) {}

  async getBalances(userId: string) {
    const [walletBalances, marketMakingOrders, activityEntries] =
      await Promise.all([
        this.loadWalletBalances(userId),
        this.loadMarketMakingOrders(userId),
        this.loadFundingActivity(userId),
      ]);
    const marketMakingBalances = await this.loadMarketMakingBalances(
      userId,
      marketMakingOrders,
    );
    const inMarketMaking = this.groupMarketMakingBalances(marketMakingBalances);

    return {
      namespace: WEB3_BALANCES_NAMESPACE,
      walletOrderId: this.getWalletOrderId(userId),
      available: walletBalances.map((balance) =>
        this.serializeBalance(balance),
      ),
      inMarketMaking,
      lockedInOrders: inMarketMaking,
      activity: activityEntries.map((entry) => this.serializeActivity(entry)),
      summary: {
        availableAssetCount: walletBalances.length,
        inMarketMakingAssetCount: inMarketMaking.length,
        activityCount: activityEntries.length,
      },
    };
  }

  private async loadWalletBalances(
    userId: string,
  ): Promise<MarketMakingOrderBalance[]> {
    return await this.orderBalanceRepository.find({
      where: {
        orderId: this.getWalletOrderId(userId),
        userId,
      },
      order: { assetId: 'ASC' },
    });
  }

  private async loadMarketMakingOrders(
    userId: string,
  ): Promise<MarketMakingOrder[]> {
    const orders = await this.userOrdersService.findMarketMakingByUserId(
      userId,
    );

    return orders.filter((order) => order.source !== 'admin_direct');
  }

  private async loadMarketMakingBalances(
    userId: string,
    orders: MarketMakingOrder[],
  ): Promise<MarketMakingOrderBalance[]> {
    const orderIds = orders.map((order) => order.orderId);

    if (orderIds.length === 0) {
      return [];
    }

    return await this.orderBalanceRepository.find({
      where: orderIds.map((orderId) => ({ orderId, userId })),
      order: { assetId: 'ASC', orderId: 'ASC' },
    });
  }

  private async loadFundingActivity(userId: string): Promise<LedgerEntry[]> {
    return await this.ledgerEntryRepository.find({
      where: {
        userId,
        type: In(FUNDING_ACTIVITY_TYPES),
      },
      order: { createdAt: 'DESC', entryId: 'DESC' },
      take: 100,
    });
  }

  private groupMarketMakingBalances(
    balances: MarketMakingOrderBalance[],
  ): MarketMakingBalanceGroup[] {
    const groups = new Map<string, MarketMakingBalanceGroup>();

    for (const balance of balances) {
      const existing = groups.get(balance.assetId) || {
        assetId: balance.assetId,
        available: '0',
        locked: '0',
        total: '0',
        orderCount: 0,
        orders: [],
      };

      existing.available = this.add(existing.available, balance.available);
      existing.locked = this.add(existing.locked, balance.locked);
      existing.total = this.add(existing.total, balance.total);
      existing.orderCount += 1;
      existing.orders.push(this.serializeBalance(balance));
      groups.set(balance.assetId, existing);
    }

    return [...groups.values()].sort((left, right) =>
      left.assetId.localeCompare(right.assetId),
    );
  }

  private serializeBalance(
    balance: MarketMakingOrderBalance,
  ): SerializedBalance {
    return {
      orderId: balance.orderId,
      assetId: balance.assetId,
      available: this.normalizeAmount(balance.available),
      locked: this.normalizeAmount(balance.locked),
      total: this.normalizeAmount(balance.total),
      initialDeposit: this.normalizeAmount(balance.initialDeposit),
      realizedDelta: this.normalizeAmount(balance.realizedDelta),
      feePaid: this.normalizeAmount(balance.feePaid),
      updatedAt: balance.updatedAt,
    };
  }

  private serializeActivity(entry: LedgerEntry) {
    const signedAmount = this.normalizeAmount(entry.amount);
    const amount = new BigNumber(signedAmount).abs().toFixed();

    return {
      activityId: entry.entryId,
      direction:
        entry.type === 'deposit_credit'
          ? ('deposit' as const)
          : ('withdrawal' as const),
      ledgerType: entry.type,
      scope:
        entry.orderId === this.getWalletOrderId(entry.userId)
          ? 'wallet'
          : 'market_making_order',
      orderId: entry.orderId,
      assetId: entry.assetId,
      amount,
      signedAmount,
      refType: entry.refType || null,
      refId: entry.refId || null,
      idempotencyKey: entry.idempotencyKey,
      createdAt: entry.createdAt,
    };
  }

  private getWalletOrderId(userId: string): string {
    return `${WEB3_WALLET_ORDER_PREFIX}:${userId}`;
  }

  private add(left: string, right: string): string {
    return new BigNumber(left || 0).plus(right || 0).toFixed();
  }

  private normalizeAmount(value: string | null | undefined): string {
    const amount = new BigNumber(value || 0);

    return amount.isFinite() ? amount.toFixed() : '0';
  }
}
