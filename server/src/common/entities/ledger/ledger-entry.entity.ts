/**
 * Stores immutable balance ledger entries with idempotency tracking.
 * Used by app.module and modules/market-making/ledger balance ledger service.
 */
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type LedgerEntryType =
  | 'DEPOSIT_CREDIT'
  | 'LOCK'
  | 'UNLOCK'
  | 'MM_REALIZED_PNL'
  | 'REWARD_CREDIT'
  | 'WITHDRAW_DEBIT'
  | 'FEE_DEBIT'
  | 'ADJUSTMENT';

@Entity()
export class LedgerEntry {
  @PrimaryColumn()
  entryId: string;

  @Column()
  @Index()
  userId: string;

  @Column()
  @Index()
  assetId: string;

  @Column()
  amount: string;

  @Column()
  type: LedgerEntryType;

  @Column({ nullable: true })
  refType?: string;

  @Column({ nullable: true })
  refId?: string;

  @Column({ unique: true })
  idempotencyKey: string;

  @Column()
  createdAt: string;
}
