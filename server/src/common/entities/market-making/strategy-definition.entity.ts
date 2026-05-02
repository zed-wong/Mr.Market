import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { getRFC3339Timestamp } from '../../helpers/utils';

export enum StrategyDefinitionVisibility {
  PUBLIC = 'public',
  ADMIN = 'admin',
}

export type StrategyDirectExecutionMode = 'single_account' | 'dual_account';
export const STRATEGY_LAUNCH_SURFACES = [
  'strategy_settings',
  'admin_direct_mm',
] as const;
export type StrategyLaunchSurface = (typeof STRATEGY_LAUNCH_SURFACES)[number];

export type StrategyDefinitionCapabilities = {
  launchSurfaces: StrategyLaunchSurface[];
  directExecutionMode?: StrategyDirectExecutionMode | null;
};

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

  @Column()
  controllerType: string;

  @Column('simple-json')
  configSchema: Record<string, unknown>;

  @Column('simple-json')
  defaultConfig: Record<string, unknown>;

  @Column('simple-json', { nullable: true })
  capabilities?: StrategyDefinitionCapabilities;

  @Column({ default: true })
  enabled: boolean;

  @Column({
    type: 'simple-enum',
    enum: StrategyDefinitionVisibility,
    default: StrategyDefinitionVisibility.ADMIN,
  })
  visibility: StrategyDefinitionVisibility;

  @Column({ nullable: true })
  createdBy?: string;

  @Column()
  createdAt: string;

  @Column()
  updatedAt: string;

  @BeforeInsert()
  setCreatedTimestamps(): void {
    const now = getRFC3339Timestamp();

    this.createdAt = this.createdAt || now;
    this.updatedAt = this.updatedAt || now;
  }

  @BeforeUpdate()
  setUpdatedTimestamp(): void {
    this.updatedAt = getRFC3339Timestamp();
  }
}
