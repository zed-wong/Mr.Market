import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('strategy_definitions')
export class StrategyDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_strategy_definitions_key', { unique: true })
  @Column()
  key: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ name: 'executorType' })
  controllerType: string;

  get executorType(): string {
    return this.controllerType;
  }

  set executorType(value: string) {
    this.controllerType = value;
  }

  @Column('simple-json')
  configSchema: Record<string, unknown>;

  @Column('simple-json')
  defaultConfig: Record<string, unknown>;

  @Column({ default: true })
  enabled: boolean;

  @Column({ default: 'system' })
  visibility: string;

  @Column({ nullable: true })
  createdBy?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
