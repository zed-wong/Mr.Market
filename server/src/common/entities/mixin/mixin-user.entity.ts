/**
 * Stores Mixin user profiles and auth/session metadata.
 * Used by app.module, common/helpers/mixin/user, admin strategy services, and modules/mixin/user.
 */
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

import { Contribution } from '../campaign/contribution.entity';

@Entity()
export class MixinUser {
  @PrimaryGeneratedColumn('uuid')
  user_id: string;

  @Column({ nullable: true })
  type: string;

  @Column()
  identity_number: string;

  @Column({ nullable: true })
  phone: string;

  @Column()
  full_name: string;

  @Column({ nullable: true })
  avatar_url: string;

  @Column()
  jwt_token: string;

  @OneToMany(() => Contribution, (contribution) => contribution.mixinUser)
  contributions: Contribution[];

  @Column()
  created_at: string;

  @Column()
  last_updated: string;

  @Column({ nullable: true }) // Optional wallet address field
  walletAddress: string;
}
