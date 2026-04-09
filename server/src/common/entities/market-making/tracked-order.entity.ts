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

  @Column()
  pair: string;

  @Column()
  exchangeOrderId: string;

  @Column({ nullable: true })
  clientOrderId?: string;

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
