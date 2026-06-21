import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'token_registry' })
@Index(['chainId', 'contractAddress'], { unique: true })
export class TokenRegistryEntry {
  @PrimaryColumn()
  assetId: string;

  @Column()
  @Index()
  chainId: number;

  @Column()
  contractAddress: string;

  @Column()
  symbol: string;

  @Column()
  decimals: number;

  @Column({ default: false })
  isNative: boolean;

  @Column()
  createdAt: string;

  @Column()
  updatedAt: string;
}
