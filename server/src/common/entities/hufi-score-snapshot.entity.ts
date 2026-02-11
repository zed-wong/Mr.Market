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
