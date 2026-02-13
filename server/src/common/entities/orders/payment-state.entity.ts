/**
 * Persists payment state machines for market-making and simply-grow order funding.
 * Used by app.module and modules/market-making user-orders services/processors.
 */
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity()
export abstract class PaymentState {
  @PrimaryColumn()
  orderId: string;

  @Column()
  userId: string;

  @Column()
  type: string; // 'market_making', 'simply_grow', etc.

  @Column({ nullable: true })
  state: string; // payment_pending, payment_incomplete, payment_complete, timeout

  @Column()
  createdAt: string;

  @Column()
  updatedAt: string;
}

@Entity()
export class MarketMakingPaymentState extends PaymentState {
  @Column()
  symbol: string; // the symbol of trading pair

  // Category 1: Market Making Funds (for trading on exchange)
  @Column()
  baseAssetId: string; // base asset ID for market making

  @Column({ default: '0' })
  baseAssetAmount: string; // amount of base asset received

  @Column({ nullable: true })
  baseAssetSnapshotId: string; // snapshot ID for base asset transfer

  @Column()
  quoteAssetId: string; // quote asset ID for market making

  @Column({ default: '0' })
  quoteAssetAmount: string; // amount of quote asset received

  @Column({ nullable: true })
  quoteAssetSnapshotId: string; // snapshot ID for quote asset transfer

  // Category 2: Withdrawal Network Fees (Mixin → exchange)
  @Column({ nullable: true })
  baseFeeAssetId: string; // asset ID for base withdrawal fee

  @Column({ default: '0' })
  baseFeeAssetAmount: string; // amount of base fee asset received

  @Column({ nullable: true })
  baseFeeAssetSnapshotId: string; // snapshot ID for base fee transfer

  @Column({ nullable: true })
  quoteFeeAssetId: string; // asset ID for quote withdrawal fee

  @Column({ default: '0' })
  quoteFeeAssetAmount: string; // amount of quote fee asset received

  @Column({ nullable: true })
  quoteFeeAssetSnapshotId: string; // snapshot ID for quote fee transfer

  @Column({ nullable: true })
  requiredBaseWithdrawalFee: string; // required amount for base withdrawal

  @Column({ nullable: true })
  requiredQuoteWithdrawalFee: string; // required amount for quote withdrawal

  // Category 3: Mr.Market Strategy Fee (service fee) - charged as percentage
  @Column({ nullable: true })
  baseStrategyFeeAssetId: string; // asset ID for base strategy fee

  @Column({ default: '0' })
  baseStrategyFeeAmount: string; // actual collected base strategy fee amount

  @Column({ nullable: true })
  baseStrategyFeeSnapshotId: string; // snapshot ID for base strategy fee transfer

  @Column({ nullable: true })
  quoteStrategyFeeAssetId: string; // asset ID for quote strategy fee

  @Column({ default: '0' })
  quoteStrategyFeeAmount: string; // actual collected quote strategy fee amount

  @Column({ nullable: true })
  quoteStrategyFeeSnapshotId: string; // snapshot ID for quote strategy fee transfer

  @Column({ nullable: true })
  requiredStrategyFeePercentage: string; // strategy fee percentage (e.g., "3" for 3%)
}
