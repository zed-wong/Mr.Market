import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type Web3WithdrawalStatus =
  | 'pending'
  | 'submitted'
  | 'completed'
  | 'failed'
  | 'blocked';

@Entity({ name: 'web3_withdrawal' })
export class Web3Withdrawal {
  @PrimaryColumn()
  withdrawalId: string;

  @Column()
  @Index()
  userId: string;

  @Column()
  chainId: number;

  @Column()
  tokenAddress: string;

  @Column()
  assetId: string;

  @Column()
  amount: string;

  @Column()
  recipientAddress: string;

  @Column()
  status: Web3WithdrawalStatus;

  @Column()
  @Index({ unique: true })
  idempotencyKey: string;

  @Column()
  payloadHash: string;

  @Column()
  ledgerDebitIdempotencyKey: string;

  @Column({ nullable: true })
  ledgerEntryId?: string;

  @Column({ nullable: true })
  txHash?: string;

  @Column({ nullable: true })
  failureReason?: string;

  @Column()
  createdAt: string;

  @Column()
  updatedAt: string;
}
