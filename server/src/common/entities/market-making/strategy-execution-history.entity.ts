import { Side } from 'src/common/constants/side';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { BeforeInsert, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

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
  runtimeInstanceKey?: string;

  @Column({ nullable: true })
  orderId?: string;

  @Column({ nullable: true })
  status?: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;

  @Column()
  executedAt!: string;

  @BeforeInsert()
  setExecutedAt(): void {
    this.executedAt = this.executedAt || getRFC3339Timestamp();
  }
}
