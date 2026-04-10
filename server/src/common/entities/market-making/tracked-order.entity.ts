import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'tracked_order' })
export class TrackedOrderEntity {
  @PrimaryColumn()
  @Index()
  trackingKey: string;

  @Column()
  orderId: string;

  @Column()
  @Index()
  strategyKey: string;

  @Column()
  exchange: string;

  @Column({ nullable: true })
  accountLabel?: string;

  @Column()
  pair: string;

  @Column()
  exchangeOrderId: string;

  @Column({ nullable: true })
  clientOrderId?: string;

  @Column({ nullable: true })
  slotKey?: string;

  @Column({ nullable: true })
  role?: string;

  @Column()
  side: string;

  @Column()
  price: string;

  @Column()
  qty: string;

  @Column({ nullable: true })
  cumulativeFilledQty?: string;

  @Column()
  status: string;

  @Column()
  createdAt: string;

  @Column()
  updatedAt: string;
}
