/**
 * Stores spot order requests mapped from Mixin snapshots to exchange execution.
 * Used by app.module and modules/mixin/exchange repository/service/module.
 */
import type { SpotOrderType } from 'src/common/types/memo/memo';
import type { SpotOrderStatus } from 'src/common/types/orders/states';
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity()
export class SpotOrder {
  @PrimaryColumn()
  orderId: string; // UUID

  @Column()
  snapshotId: string; // Mixin snapshot UUID

  @Column()
  userId: string;

  @Column()
  exchangeName: string; // Name of exchange

  @Column()
  type: SpotOrderType;

  @Column()
  state: SpotOrderStatus;

  @Column()
  symbol: string;

  @Column()
  amount: string; // The amount of pay asset received

  @Column()
  baseAssetId: string; // Mixin asset UUID

  @Column()
  targetAssetId: string; // Mixin asset UUID

  @Column()
  apiKeyId?: string; // API key id used for place order

  @Column()
  limitPrice?: string; // Limit price for limit order

  @Column()
  createdAt: string; // timestamp

  @Column()
  updatedAt: string; // timestamp
}
