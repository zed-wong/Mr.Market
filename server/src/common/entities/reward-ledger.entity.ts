import { Column, Entity, PrimaryColumn } from 'typeorm';

export type RewardLedgerStatus =
  | 'OBSERVED'
  | 'CONFIRMED'
  | 'TRANSFERRED_TO_MIXIN'
  | 'DISTRIBUTED';

@Entity()
export class RewardLedger {
  @PrimaryColumn()
  txHash: string;

  @Column()
  token: string;

  @Column()
  amount: string;

  @Column()
  campaignId: string;

  @Column()
  dayIndex: number;

  @Column()
  status: RewardLedgerStatus;

  @Column()
  observedAt: string;

  @Column({ nullable: true })
  confirmedAt?: string;

  @Column({ nullable: true })
  distributedAt?: string;
}
