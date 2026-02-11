import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity()
export class OutboxEvent {
  @PrimaryColumn()
  eventId: string;

  @Column()
  @Index()
  topic: string;

  @Column()
  @Index()
  aggregateType: string;

  @Column()
  @Index()
  aggregateId: string;

  @Column({ type: 'text' })
  payload: string;

  @Column()
  createdAt: string;
}
