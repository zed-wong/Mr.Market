import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type OrderLpPositionStatus =
  | 'opening'
  | 'active'
  | 'out_of_range'
  | 'closing'
  | 'closed'
  | 'failed'
  | 'manual_review';

@Entity({ name: 'order_lp_positions' })
@Index(['userOrderId', 'accountLabel'])
@Index(['connectorId', 'chainId', 'positionTokenId'], { unique: true })
export class OrderLpPosition {
  @PrimaryColumn()
  id: string;

  @Column()
  @Index()
  userOrderId: string;

  @Column()
  @Index()
  ledgerOrderId: string;

  @Column({ default: 'default' })
  accountLabel: string;

  @Column()
  connectorId: string;

  @Column()
  @Index()
  chainId: number;

  @Column()
  @Index()
  tradingAccountId: string;

  @Column()
  positionTokenId: string;

  @Column()
  poolAddress: string;

  @Column()
  token0: string;

  @Column()
  token1: string;

  @Column()
  feeTier: number;

  @Column()
  tickLower: number;

  @Column()
  tickUpper: number;

  @Column()
  liquidity: string;

  @Column()
  @Index()
  status: OrderLpPositionStatus;

  @Column()
  openedByIntentId: string;

  @Column({ nullable: true })
  closedByIntentId?: string;

  @Column({ nullable: true })
  lastConfirmedBlock?: number;

  @Column({ nullable: true })
  uncollectedFees0?: string;

  @Column({ nullable: true })
  uncollectedFees1?: string;

  @Column()
  createdAt: string;

  @Column()
  updatedAt: string;
}
