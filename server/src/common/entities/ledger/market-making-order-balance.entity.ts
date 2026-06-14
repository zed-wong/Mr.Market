/**
 * Maintains current per-order per-asset market-making balances.
 * Used by the market-making ledger and reconciliation services.
 */
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity()
export class MarketMakingOrderBalance {
  @PrimaryColumn()
  orderId: string;

  @Column()
  @Index()
  userOrderId: string;

  @Column({ default: 'default' })
  @Index()
  accountLabel: string;

  @Column()
  @Index()
  userId: string;

  @PrimaryColumn()
  assetId: string;

  @Column({ default: '0' })
  available: string;

  @Column({ default: '0' })
  locked: string;

  @Column({ default: '0' })
  total: string;

  @Column({ default: '0' })
  initialDeposit: string;

  @Column({ default: '0' })
  realizedDelta: string;

  @Column({ default: '0' })
  feePaid: string;

  @Column()
  updatedAt: string;
}
