/**
 * Stores campaign definitions and scheduling metadata for reward programs.
 * Used by app.module, modules/campaign sync logic, and modules/market-making/local-campaign.
 */
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  chainId: number;

  @Column({ nullable: true })
  address: string;

  @Column()
  pair: string;

  @Column()
  exchange: string;

  @Column()
  rewardToken: string;

  @Column()
  startTime: Date;

  @Column()
  endTime: Date;

  @Column()
  status: string; // 'active', 'completed', 'cancelled'

  @Column('decimal', { precision: 20, scale: 8 })
  totalReward: number;

  @Column({ nullable: true })
  type: string; // 'volume', 'liquidity', etc.

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
