/**
 * Persists token release requests and release history tied to spot order settlement.
 * Used by app.module and modules/mixin/exchange repository/module.
 */
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity()
export class MixinReleaseToken {
  @PrimaryColumn()
  orderId: string; // UUID

  @Column()
  userId: string; // User UUID

  @Column()
  assetId: string; // Asset UUID

  @Column()
  state: string; // state of release token

  @Column()
  amount: string; // amount of token

  @Column()
  createdAt: string; // timestamp

  @Column()
  updatedAt: string; // timestamp
}

@Entity()
export class MixinReleaseHistory {
  @PrimaryColumn()
  orderId: string; // UUID

  @Column()
  snapshotId: string; // Mixin snapshot ID

  @Column()
  createdAt: string; // timestamp

  @Column()
  fee: string;
}
