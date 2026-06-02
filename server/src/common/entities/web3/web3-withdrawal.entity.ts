import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type Web3WithdrawalStatus =
  | 'created'
  | 'onchain_seen'
  | 'processing'
  | 'submitted'
  | 'paid'
  | 'failed'
  | 'blocked'
  | 'rejected'
  | 'expired';

@Entity({ name: 'web3_withdrawal' })
export class Web3Withdrawal {
  @PrimaryColumn()
  withdrawalId: string;

  @Column()
  @Index()
  userId: string;

  @Column()
  orderId: string;

  @Column()
  chainId: number;

  @Column()
  routerAddress: string;

  @Column()
  tokenAddress: string;

  @Column()
  assetId: string;

  @Column()
  amount: string;

  @Column()
  recipientAddress: string;

  @Column()
  feeTokenAddress: string;

  @Column()
  feeAssetId: string;

  @Column()
  feeAmount: string;

  @Column()
  status: Web3WithdrawalStatus;

  @Column()
  @Index({ unique: true })
  idempotencyKey: string;

  @Column()
  payloadHash: string;

  @Column()
  requestSecret: string;

  @Column()
  ledgerDebitIdempotencyKey: string;

  @Column()
  feeDebitIdempotencyKey: string;

  @Column({ nullable: true })
  ledgerEntryId?: string;

  @Column({ nullable: true })
  feeLedgerEntryId?: string;

  @Column({ nullable: true })
  requestTxHash?: string;

  @Column({ nullable: true })
  requestLogIndex?: number;

  @Column({ nullable: true })
  startBlockNumber?: number;

  @Column({ nullable: true })
  payoutTxHash?: string;

  @Column({ nullable: true })
  externalPayoutId?: string;

  @Column({ nullable: true })
  failureReason?: string;

  @Column()
  createdAt: string;

  @Column()
  expiresAt: string;

  @Column()
  updatedAt: string;
}
