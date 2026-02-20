/**
 * Stores lifecycle/configuration of created strategy instances per user/client.
 * Used by app.module and modules/market-making strategy services plus admin strategy tools.
 */
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Contribution } from '../campaign/contribution.entity';

@Entity('strategy_instances')
export class StrategyInstance {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  strategyKey: string;

  @Column()
  userId: string;

  @Column()
  clientId: string;

  @Column()
  strategyType: string;

  @Column()
  startPrice: number;

  @Column('json')
  parameters: Record<string, any>;

  @Column()
  status: string; // "running", "stopped", etc.

  @OneToMany(() => Contribution, (contribution) => contribution.strategy)
  contributions: Contribution[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
