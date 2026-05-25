/**
 * Stores durable chronological lifecycle events for market-making orders.
 */
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type MarketMakingLifecycleEventType =
  | 'order_created'
  | 'order_started'
  | 'order_paused'
  | 'order_resumed';

@Entity({ name: 'market_making_lifecycle_event' })
export class MarketMakingLifecycleEvent {
  @PrimaryColumn()
  eventId: string;

  @Column()
  @Index()
  orderId: string;

  @Column()
  @Index()
  userId: string;

  @Column({ type: 'varchar' })
  type: MarketMakingLifecycleEventType;

  @Column()
  timestamp: string;

  @Column({ nullable: true })
  fromState?: string | null;

  @Column({ nullable: true })
  toState?: string | null;

  @Column({ nullable: true })
  refType?: string | null;

  @Column({ nullable: true })
  refId?: string | null;

  @Column('simple-json', { nullable: true })
  metadata?: Record<string, unknown> | null;
}
