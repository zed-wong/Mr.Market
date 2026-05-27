/**
 * Stores global admin runtime configuration values (fees and funding account).
 * Used by app.module, database seeders, and admin/infrastructure config services.
 */
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class CustomConfigEntity {
  @PrimaryGeneratedColumn()
  config_id: number; // The index config, 0 by default

  @Column()
  funding_account: string; // The address or info about a safe place for storing profit

  @Column()
  spot_fee: string; // The spot trading fee

  @Column({ default: '0.001' })
  market_making_fee: string; // The market making fee

  @Column({ default: true })
  enable_spot_fee: boolean;

  @Column({ default: true })
  enable_market_making_fee: boolean;
}
