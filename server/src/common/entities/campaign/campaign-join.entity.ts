import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'campaign_join' })
export class CampaignJoin {
  @PrimaryColumn()
  id: string;

  @Column()
  @Index()
  evmAddress: string;

  @Column()
  apiKeyId: string;

  @Column()
  chainId: number;

  @Column()
  campaignAddress: string;

  @Column({ nullable: true })
  orderId?: string | null;

  @Column()
  status: string;

  @Column()
  createdAt: string;

  @Column()
  updatedAt: string;
}
