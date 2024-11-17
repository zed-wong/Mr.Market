import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity('growdata_exchanges')
export class GrowdataExchange {
  @PrimaryGeneratedColumn()
  exchange_id: string; // like binance, bitget, etc.

  @Column()
  name: string;

  @Column({ default: true })
  enable: boolean;
}

@Entity('growdata_simply_grow_tokens')
export class GrowdataSimplyGrowToken {
  @PrimaryGeneratedColumn('uuid')
  asset_id: string;

  @Column()
  name: string;

  @Column()
  symbol: string;

  @Column()
  icon_url: string;

  @Column({ nullable: true })
  apy: string;

  @Column({ default: true })
  enable: boolean;
}

@Entity('growdata_arbitrage_pairs')
export class GrowdataArbitragePair {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  symbol: string;

  @Column()
  base_symbol: string;

  @Column()
  target_symbol: string;

  @Column()
  base_asset_id: string;

  @Column()
  base_icon_url: string;

  @Column()
  target_asset_id: string;

  @Column()
  target_icon_url: string;

  @Column({ nullable: true })
  base_price: string;

  @Column({ nullable: true })
  target_price: string;

  @ManyToOne(() => GrowdataExchange)
  @JoinColumn({ name: 'exchange_id' })
  exchange: GrowdataExchange;

  @Column({ default: true })
  enable: boolean;
}

@Entity('growdata_market_making_pairs')
export class GrowdataMarketMakingPair {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  symbol: string;

  @Column()
  base_symbol: string;

  @Column()
  target_symbol: string;

  @Column()
  base_asset_id: string;

  @Column()
  base_icon_url: string;

  @Column()
  target_asset_id: string;

  @Column()
  target_icon_url: string;

  @Column({ nullable: true })
  base_price: string;

  @Column({ nullable: true })
  target_price: string;

  @ManyToOne(() => GrowdataExchange)
  @JoinColumn({ name: 'exchange_id' })
  exchange: GrowdataExchange;

  @Column({ default: true })
  enable: boolean;
}
