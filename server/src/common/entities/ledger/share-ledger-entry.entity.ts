/**
 * Records share-ledger changes used as basis for reward allocation calculations.
 * Used by app.module and modules/market-making/rewards share-ledger service.
 */
import { Column, Entity, PrimaryColumn } from 'typeorm';

export type ShareLedgerEntryType = 'MINT' | 'BURN';

@Entity()
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
