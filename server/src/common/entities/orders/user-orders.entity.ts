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

  @Column()
  priceSourceType: PriceSourceType;

  @Column()
  amountChangePerLayer: string; // This can be a fixed amount or a percentage

  @Column()
  amountChangeType: 'fixed' | 'percentage';

  @Column()
  ceilingPrice?: string;

  @Column()
  floorPrice?: string;

  @Column({ nullable: true })
  balanceA?: string;

  @Column({ nullable: true })
  balanceB?: string;

  @Column()
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

  @Column()
  state: SimplyGrowStates;

  @Column()
  createdAt: string;

  @Column()
  rewardAddress: string;
}
