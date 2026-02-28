import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';
import { Side } from '../constants/side';

export enum Strategy {
  TIME_INDICATOR = 'timeIndicator',
}

@Entity({ name: 'indicator_strategy_history' })
export class IndicatorStrategyHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  @Column()
  clientId!: string;

  @Column()
  exchange!: string;

  @Column()
  symbol!: string;

  @Column({ type: 'float' })
  price!: number;

  @Column({ type: 'float' })
  amount!: number;

  @Column({ type: 'simple-enum', enum: Side })
  side!: Side;

  @Column({ type: 'simple-enum', enum: Strategy, default: Strategy.TIME_INDICATOR })
  strategy!: Strategy;

  @Column({ nullable: true })
  orderId?: string;

  @CreateDateColumn()
  executedAt!: Date;
}
