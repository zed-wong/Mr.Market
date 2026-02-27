/**
 * Records share-ledger changes used as basis for reward allocation calculations.
 * Used by app.module and modules/market-making/rewards share-ledger service.
 */
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type ShareLedgerEntryType = 'MINT' | 'BURN';

@Entity()
@Index('IDX_share_ledger_user_type_ref', ['userId', 'type', 'refId'], {
  unique: true,
})
export class ShareLedgerEntry {
  @PrimaryColumn()
  entryId: string;

  @Column()
  userId: string;

  @Column()
  type: ShareLedgerEntryType;

  @Column()
  amount: string;

  @Column()
  refId: string;

  @Column()
  createdAt: string;
}
