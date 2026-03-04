import { Side } from 'src/common/constants/side';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'strategy_execution_history' })
export class StrategyExecutionHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  @Column({ nullable: true })
  clientId?: string;

  @Column()
  exchange!: string;

  @Column()
  pair!: string;

  @Column({ type: 'simple-enum', enum: Side, nullable: true })
  side?: Side;

  @Column({ type: 'text', nullable: true })
  amount?: string;

  @Column({ type: 'text', nullable: true })
  price?: string;

  @Column()
  strategyType!: string;

  @Column({ nullable: true })
  strategyInstanceId?: string;

  @Column({ nullable: true })
  orderId?: string;

  @Column({ nullable: true })
  status?: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn({ type: 'datetime' })
  executedAt!: Date;
}
