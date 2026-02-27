/**
 * Maintains current per-user per-asset balances as a read model projection.
 * Used by app.module and modules/market-making ledger/reconciliation services.
 */
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity()
export class BalanceReadModel {
  @PrimaryColumn()
  userId: string;

  @PrimaryColumn()
  assetId: string;

  @Column({ default: '0' })
  available: string;

  @Column({ default: '0' })
  locked: string;

  @Column({ default: '0' })
  total: string;

  @Column()
  updatedAt: string;
}
