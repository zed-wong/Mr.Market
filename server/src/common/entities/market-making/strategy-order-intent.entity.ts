/**
 * Stores strategy-level order intents and state transitions for durable execution.
 * Used by app.module and modules/market-making strategy/reconciliation services.
 */
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'strategy_order_intent' })
export class StrategyOrderIntentEntity {
  @PrimaryColumn()
  intentId: string;

  @Column()
  strategyInstanceId: string;

  @Column()
  @Index()
  strategyKey: string;

  @Column()
  userId: string;

  @Column()
  clientId: string;

  @Column()
  type: string;

  @Column()
  exchange: string;

  @Column()
  pair: string;

  @Column()
  side: string;

  @Column()
  price: string;

  @Column()
  qty: string;

  @Column({ nullable: true })
  mixinOrderId?: string;

  @Column()
  @Index()
  status: string;

  @Column({ nullable: true })
  errorReason?: string;

  @Column()
  createdAt: string;

  @Column()
  updatedAt: string;
}
