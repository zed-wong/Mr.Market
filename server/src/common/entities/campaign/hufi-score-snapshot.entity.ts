/**
 * Stores daily HUFI score snapshots derived from market-making activity.
 * Used by app.module and modules/campaign score estimator logic.
 */
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class HufiScoreSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  day: string;

  @Column()
  pair: string;

  @Column()
  exchange: string;

  @Column()
  makerVolume: string;

  @Column()
  takerVolume: string;

  @Column()
  score: string;

  @Column()
  createdAt: string;
}
