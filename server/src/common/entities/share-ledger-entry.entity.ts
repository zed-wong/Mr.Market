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
