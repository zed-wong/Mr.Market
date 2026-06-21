import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type TradingAccountType = 'evm_wallet';

export type TradingAccountPurpose =
  | 'clob_trading'
  | 'dex_execution'
  | 'funding_operator';

export type TradingAccountValidationStatus = 'pending' | 'valid' | 'invalid';

@Entity({ name: 'trading_accounts' })
export class TradingAccount {
  @PrimaryColumn()
  id: string;

  @Column()
  label: string;

  @Column()
  @Index()
  type: TradingAccountType;

  @Column()
  @Index()
  purpose: TradingAccountPurpose;

  @Column({ type: 'simple-json' })
  chainIds: number[];

  @Column()
  @Index()
  walletAddress: string;

  @Column()
  encryptedPrivateKey: string;

  @Column({ default: 'pending' })
  @Index()
  validationStatus: TradingAccountValidationStatus;

  @Column()
  createdAt: string;

  @Column()
  updatedAt: string;
}
