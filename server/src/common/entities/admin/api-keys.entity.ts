/**
 * Persists exchange API key metadata used by exchange connectivity flows.
 * Used by TypeORM registration in app.module and in modules/infrastructure/exchange-init and modules/mixin/exchange.
 */
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class APIKeysConfig {
  @PrimaryGeneratedColumn()
  key_id: string; // The autoincrement primary key for an admin-owned exchange API key

  @Column()
  exchange: string; // The identifier of exchange

  @Column()
  name: string; // The name(alias) of API key

  @Column()
  api_key: string; // The API Key

  @Column()
  api_secret: string; // The secret

  @Column({ default: 'read' })
  permissions: string; // 'read' or 'read-trade'

  @Column({ default: 'pending' })
  validation_status: string; // pending, valid, invalid

  @Column({ nullable: true })
  validation_error?: string | null;

  @Column({ nullable: true })
  validated_at?: string | null;

  @Column()
  created_at: string; // RFC3339 creation timestamp
}
