import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'web3_event_log' })
@Index(['chainId', 'txHash', 'logIndex'], { unique: true })
export class Web3EventLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  chainId: number;

  @Column()
  contractAddress: string;

  @Column()
  eventName: string;

  @Column()
  txHash: string;

  @Column()
  logIndex: number;

  @Column({ nullable: true })
  blockNumber?: number;

  @Column('simple-json')
  payloadJson: Record<string, unknown>;

  @Column()
  processedAt: string;

  @Column()
  createdAt: string;
}
