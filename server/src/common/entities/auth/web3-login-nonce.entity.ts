/**
 * Stores server-issued web3 login nonces for single-use wallet authentication.
 */
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'web3_login_nonce' })
export class Web3LoginNonceEntity {
  @PrimaryColumn()
  nonce: string;

  @Column()
  @Index()
  address: string;

  @Column()
  @Index()
  chainId: string;

  @Column()
  domain: string;

  @Column()
  statement: string;

  @Column()
  uri: string;

  @Column()
  issuedAt: string;

  @Column()
  expiresAt: string;

  @Column({ nullable: true })
  consumedAt?: string | null;
}
