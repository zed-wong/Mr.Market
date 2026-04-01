import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export type CampaignJoinStatus =
  | 'pending'
  | 'linked'
  | 'detached'
  | 'joined'
  | 'failed';

@Entity()
@Unique('UQ_campaign_join_binding', [
  'evmAddress',
  'apiKeyId',
  'campaignAddress',
  'chainId',
])
export class CampaignJoin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  evmAddress: string;

  @Column()
  apiKeyId: string;

  @Column('integer')
  chainId: number;

  @Column()
  campaignAddress: string;

  @Column({ nullable: true })
  orderId?: string | null;

  @Column({ type: 'varchar' })
  status: CampaignJoinStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
