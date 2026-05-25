import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'setup_config' })
export class SetupConfigEntity {
  @PrimaryColumn()
  key: string;

  @Column({ type: 'text' })
  value: string;

  @Column({ default: false })
  encrypted: boolean;

  @Column({ default: false })
  secret: boolean;

  @Column({ nullable: true })
  updatedAt?: string | null;
}
