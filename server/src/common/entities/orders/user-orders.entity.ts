/**
 * Stores user-level order intents for market-making and simply-grow products.
 * Used by app.module and modules/market-making strategy/user-orders services and processors.
 */
import { PriceSourceType } from 'src/common/enum/pricesourcetype';
import { Column, Entity, PrimaryColumn } from 'typeorm';

import type {
  MarketMakingStates,
  SimplyGrowStates,
} from '../../types/orders/states';

export type MarketMakingOrderStrategySnapshot = {
  controllerType: string;
  resolvedConfig: Record<string, unknown>;
};

@Entity()
export class MarketMakingOrder {
  @PrimaryColumn()
  orderId: string;

  @Column()
  userId: string;

  @Column()
  pair: string;

  @Column()
  exchangeName: string;

  @Column({ nullable: true })
  strategyDefinitionId?: string;

  @Column('simple-json', { nullable: true })
  strategySnapshot?: MarketMakingOrderStrategySnapshot;

  @Column({ type: 'varchar', default: 'payment_flow' })
  source: 'payment_flow' | 'admin_direct';

  @Column({ nullable: true })
  apiKeyId?: string;

  @Column()
  bidSpread: string;

  @Column()
  askSpread: string;

  @Column()
  orderAmount: string;

  @Column()
  orderRefreshTime: string;

  @Column()
  numberOfLayers: string;

  @Column({ type: 'varchar' })
  priceSourceType: PriceSourceType;

  @Column()
  amountChangePerLayer: string;

  @Column({ type: 'varchar' })
  amountChangeType: 'fixed' | 'percentage';

  @Column()
  ceilingPrice?: string;

  @Column()
  floorPrice?: string;

  @Column({ nullable: true })
  balanceA?: string;

  @Column({ nullable: true })
  balanceB?: string;

  @Column({ type: 'varchar' })
  state: MarketMakingStates;

  @Column()
  createdAt: string;

  @Column({ nullable: true })
  rewardAddress: string;
}

@Entity()
export class SimplyGrowOrder {
  @PrimaryColumn()
  orderId: string;

  @Column()
  userId: string;

  @Column()
  mixinAssetId: string;

  @Column()
  amount: string;

  @Column({ type: 'varchar' })
  state: SimplyGrowStates;

  @Column()
  createdAt: string;

  @Column()
  rewardAddress: string;
}
