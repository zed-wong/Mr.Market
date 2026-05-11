import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'admin_passkey_credentials' })
export class AdminPasskeyCredentialEntity {
  @PrimaryColumn()
  credentialId: string;

  @Column()
  publicKey: string;

  @Column({ default: 0 })
  counter: number;

  @Column({ nullable: true })
  transports?: string;

  @Column()
  createdAt: string;

  @Column()
  updatedAt: string;
}
