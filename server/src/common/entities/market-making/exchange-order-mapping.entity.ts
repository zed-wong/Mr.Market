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

  @Column({ nullable: true })
  @Index('IDX_exchange_order_mapping_exchange_order_id')
  exchangeOrderId?: string | null;

  @Column({ nullable: true })
  @Index('IDX_exchange_order_mapping_exchange_name')
  exchangeName?: string | null;

  @Column()
  @Index('IDX_exchange_order_mapping_client_order_id', { unique: true })
  clientOrderId: string;

  @Column({ nullable: true })
  @Index('IDX_exchange_order_mapping_exchange_client_order_id', {
    unique: true,
  })
  exchangeClientOrderId?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
