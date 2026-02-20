/**
 * Stores strategy performance snapshots (PnL and strategy-specific metrics).
 * Used by app.module and modules/market-making/performance service.
 */
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
export class Performance {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: string;

  @Column()
  clientId: string;

  @Column()
  strategyType: string; // e.g., "arbitrage", "momentum"

  @Column('float')
  profitLoss: number;

  @Column('simple-json', { nullable: true })
  additionalMetrics: { [key: string]: any }; // Store additional, strategy-specific metrics

  @CreateDateColumn()
  executedAt: Date;
}
