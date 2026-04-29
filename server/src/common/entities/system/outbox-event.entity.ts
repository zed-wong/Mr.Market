/**
 * Persists outbound domain events for durable outbox processing.
 * Used by app.module and modules/market-making/durability service/module/specs.
 *
 * NOTE: Currently write-only — no outbox consumer/poller exists yet.
 * Events are appended but never dispatched to downstream systems.
 * See docs/operations/runtime/runtime-safety-mechanisms.md for status.
 */
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity()
export class OutboxEvent {
  @PrimaryColumn()
  eventId: string;

  @Column()
  @Index()
  topic: string;

  @Column()
  @Index()
  aggregateType: string;

  @Column()
  @Index()
  aggregateId: string;

  @Column({ type: 'text' })
  payload: string;

  @Column()
  createdAt: string;
}
