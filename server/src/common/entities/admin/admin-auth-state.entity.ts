import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'admin_auth_state' })
export class AdminAuthStateEntity {
  @PrimaryColumn({ default: 'admin' })
  id: string;

  @Column({ default: 1 })
  tokenVersion: number;

  @Column({ default: 0 })
  failedLoginAttempts: number;

  @Column({ nullable: true })
  lockedUntil?: string;

  @Column({ nullable: true })
  currentChallenge?: string;

  @Column({ nullable: true })
  updatedAt?: string;
}
