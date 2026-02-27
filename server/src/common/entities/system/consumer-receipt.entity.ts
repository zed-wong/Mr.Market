/**
 * Persists idempotent consumer receipts for at-least-once event handling.
 * Used by app.module and modules/market-making/durability service/module/specs.
 */
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity()
@Index(['consumerName', 'idempotencyKey'], { unique: true })
export class ConsumerReceipt {
  @PrimaryColumn()
  receiptId: string;

  @Column()
  @Index()
  consumerName: string;

  @Column()
  @Index()
  idempotencyKey: string;

  @Column()
  status: string;

  @Column()
  processedAt: string;
}
