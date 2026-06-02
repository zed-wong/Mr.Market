import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type Web3FundingRequestStatus =
  | 'created'
  | 'onchain_seen'
  | 'order_created'
  | 'rejected'
  | 'expired';

@Entity({ name: 'web3_funding_request' })
export class Web3FundingRequest {
  @PrimaryColumn()
  requestId: string;

  @Column()
  @Index()
  userId: string;

  @Column()
  evmAddress: string;

  @Column()
  chainId: number;

  @Column()
  routerAddress: string;

  @Column()
  receiverAddress: string;

  @Column()
  tokenAddress: string;

  @Column()
  assetId: string;

  @Column()
  amount: string;

  @Column()
  payloadHash: string;

  @Column()
  requestSecret: string;

  @Column('simple-json')
  orderDraftJson: Record<string, unknown>;

  @Column()
  status: Web3FundingRequestStatus;

  @Column({ nullable: true })
  txHash?: string;

  @Column({ nullable: true })
  logIndex?: number;

  @Column({ nullable: true })
  startBlockNumber?: number;

  @Column({ nullable: true })
  orderId?: string;

  @Column({ nullable: true })
  rejectionReason?: string;

  @Column()
  createdAt: string;

  @Column()
  expiresAt: string;

  @Column()
  updatedAt: string;
}
