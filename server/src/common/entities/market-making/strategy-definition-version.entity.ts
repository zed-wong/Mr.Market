import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('strategy_definition_versions')
@Index('IDX_strategy_definition_versions_definition_id_version', ['definitionId', 'version'], {
  unique: true,
})
export class StrategyDefinitionVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  definitionId: string;

  @Column()
  version: string;

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

  @Column({ nullable: true })
  description?: string;

  @CreateDateColumn()
  createdAt: Date;
}
