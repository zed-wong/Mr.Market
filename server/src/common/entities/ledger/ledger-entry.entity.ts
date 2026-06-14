/**
 * Stores immutable balance ledger entries with idempotency tracking.
 * Used by app.module and modules/market-making/ledger balance ledger service.
 */
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type LedgerEntryType =
  | 'deposit_credit'
  | 'reserve_lock'
  | 'reserve_release'
  | 'fill_settle'
  | 'fee_debit'
  | 'withdraw_debit'
  | 'allocation_release'
  | 'reward_credit'
  | 'reversal';

@Entity()
export class LedgerEntry {
  @PrimaryColumn()
  entryId: string;

  @Column()
  @Index()
  orderId: string;

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
  idempotencyContentHash: string;

  @Column({ nullable: true })
  reversalOf?: string;

  @Column()
  createdAt: string;
}
