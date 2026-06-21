import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type EvmExecutionType =
  | 'swap'
  | 'lp_add'
  | 'lp_remove'
  | 'lp_collect'
  | 'approve'
  | 'wrap'
  | 'unwrap'
  | 'cancel';

export type EvmExecutionStatus =
  | 'created'
  | 'submitted'
  | 'confirmed'
  | 'failed'
  | 'reverted'
  | 'manual_review';

@Entity({ name: 'evm_executions' })
@Index(['tradingAccountId', 'chainId', 'nonce'], { unique: true })
export class EvmExecution {
  @PrimaryColumn()
  id: string;

  @Column({ nullable: true })
  @Index()
  parentExecutionId?: string;

  @Column()
  executionType: EvmExecutionType;

  @Column()
  @Index()
  userOrderId: string;

  @Column()
  @Index()
  ledgerOrderId: string;

  @Column({ default: 'default' })
  accountLabel: string;

  @Column()
  @Index()
  intentId: string;

  @Column()
  connectorId: string;

  @Column()
  exchangeType: string;

  @Column()
  @Index()
  chainId: number;

  @Column()
  @Index()
  tradingAccountId: string;

  @Column()
  nonce: number;

  @Column({ nullable: true })
  @Index()
  txHash?: string;

  @Column()
  @Index()
  status: EvmExecutionStatus;

  @Column({ nullable: true })
  submittedAt?: string;

  @Column({ nullable: true })
  confirmedAt?: string;

  @Column({ nullable: true })
  blockNumber?: number;

  @Column({ nullable: true })
  firstPendingBlockNumber?: number;

  @Column({ nullable: true })
  lastCheckedBlockNumber?: number;

  @Column({ nullable: true })
  confirmationCount?: number;

  @Column()
  requiredConfirmations: number;

  @Column({ nullable: true })
  receiptContentHash?: string;

  @Column({ type: 'simple-json', nullable: true })
  decodedEvents?: Record<string, unknown>;

  @Column({ nullable: true })
  gasUsed?: string;

  @Column({ nullable: true })
  gasPrice?: string;

  @Column({ nullable: true })
  effectiveGasCost?: string;

  @Column({ nullable: true })
  gasSponsorLedgerOrderId?: string;

  @Column({ nullable: true })
  manualReviewReason?: string;

  @Column()
  createdAt: string;

  @Column()
  updatedAt: string;
}
