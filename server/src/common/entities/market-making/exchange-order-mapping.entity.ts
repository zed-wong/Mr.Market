import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'exchange_order_mapping' })
export class ExchangeOrderMapping {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index('IDX_exchange_order_mapping_order_id')
  orderId: string;

  @Column()
  @Index('IDX_exchange_order_mapping_exchange_order_id')
  exchangeOrderId: string;

  @Column()
  @Index('IDX_exchange_order_mapping_client_order_id', { unique: true })
  clientOrderId: string;

  @CreateDateColumn()
  createdAt: Date;
}
