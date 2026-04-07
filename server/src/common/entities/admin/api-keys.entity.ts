/**
 * Persists exchange API key metadata used by exchange connectivity flows.
 * Used by TypeORM registration in app.module and in modules/infrastructure/exchange-init and modules/mixin/exchange.
 */
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class APIKeysConfig {
  @PrimaryGeneratedColumn()
  key_id: string; // The UUID for an admin-owned exchange API key

  @Column()
  exchange: string; // The identifier of exchange

  @Column()
  exchange_index: string; // The index used in the exchange map

  @Column()
  name: string; // The name(alias) of API key

  @Column()
  api_key: string; // The API Key

  @Column()
  api_secret: string; // The secret

  @Column({ default: 'read' })
  permissions: string; // 'read' or 'read-trade'

  @Column()
  created_at: string; // RFC3339 creation timestamp
}
