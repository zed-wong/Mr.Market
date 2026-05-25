import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'setup_state' })
export class SetupStateEntity {
  @PrimaryColumn({ default: 1 })
  id: number;

  @Column({ default: false })
  initialized: boolean;

  @Column({ type: 'simple-json', default: '{}' })
  completedSteps: Record<string, boolean>;

  @Column({ nullable: true })
  seededAt?: string | null;

  @Column({ nullable: true })
  completedAt?: string | null;

  @Column({ nullable: true })
  updatedAt?: string | null;
}
