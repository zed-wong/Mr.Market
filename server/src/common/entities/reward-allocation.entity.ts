import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity()
export class RewardAllocation {
  @PrimaryColumn()
  allocationId: string;

  @Column()
  rewardTxHash: string;

  @Column()
  campaignId: string;

  @Column()
  dayIndex: number;

  @Column()
  userId: string;

  @Column()
  token: string;

  @Column()
  amount: string;

  @Column()
  basisShares: string;

  @Column({ default: 'CREATED' })
  status: string;

  @Column()
  createdAt: string;
}
