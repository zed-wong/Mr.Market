/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Stores lifecycle/configuration of created strategy instances per user/client.
 * Used by app.module and modules/market-making strategy services plus admin strategy tools.
 */
import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { getRFC3339Timestamp } from '../../helpers/utils';
import { Contribution } from '../campaign/contribution.entity';

export type StrategyInstanceDefinitionSnapshot = {
  strategyDefinitionId: string;
  definitionKey: string;
  definitionName: string;
  controllerType: string;
  resolvedAt: string;
};

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

  @Column({ nullable: true })
  @Index()
  strategyDefinitionId?: string;

  @Column('simple-json', { nullable: true })
  strategyDefinitionSnapshot?: StrategyInstanceDefinitionSnapshot;

  @Column({ nullable: true })
  marketMakingOrderId?: string;

  @Column()
  startPrice: number;

  @Column('json')
  parameters: Record<string, any>;

  @Column()
  status: string; // "running", "stopped", etc.

  @OneToMany('Contribution', 'strategy')
  contributions: Contribution[];

  @Column()
  createdAt: string;

  @Column()
  updatedAt: string;

  @BeforeInsert()
  setCreatedTimestamps(): void {
    const now = getRFC3339Timestamp();

    this.createdAt = this.createdAt || now;
    this.updatedAt = this.updatedAt || now;
  }

  @BeforeUpdate()
  setUpdatedTimestamp(): void {
    this.updatedAt = getRFC3339Timestamp();
  }
}
