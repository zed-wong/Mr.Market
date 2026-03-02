import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Side } from '../constants/side';

export enum Strategy {
  TIME_INDICATOR = 'timeIndicator',
}

@Entity({ name: 'indicator_strategy_history' })
@Index('idx_indicator_strategy_history_user_client_executed_at', [
  'userId',
  'clientId',
  'executedAt',
])
export class IndicatorStrategyHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_indicator_strategy_history_user_id')
  @Column()
  userId!: string;

  @Index('idx_indicator_strategy_history_client_id')
  @Column()
  clientId!: string;

  @Column()
  exchange!: string;

  @Column()
  symbol!: string;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  price!: string;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  amount!: string;

  @Column({ type: 'simple-enum', enum: Side })
  side!: Side;

  @Column({
    type: 'simple-enum',
    enum: Strategy,
    default: Strategy.TIME_INDICATOR,
  })
  strategy!: Strategy;

  @Column({ nullable: true })
  orderId?: string;

  @CreateDateColumn()
  executedAt!: Date;
}
