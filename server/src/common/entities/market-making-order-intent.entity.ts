import { Column, Entity, PrimaryColumn } from 'typeorm';

export type MarketMakingOrderIntentState =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'expired';

@Entity()
export class MarketMakingOrderIntent {
  @PrimaryColumn()
  orderId: string;

  @Column({ nullable: true })
  userId?: string;

  @Column()
  marketMakingPairId: string;

  @Column({ default: 'pending' })
  state: MarketMakingOrderIntentState;

  @Column()
  createdAt: string;

  @Column()
  updatedAt: string;

  @Column()
  expiresAt: string;
}
