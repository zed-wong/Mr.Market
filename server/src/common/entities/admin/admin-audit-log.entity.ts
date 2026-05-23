import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type AdminAuditLogStatus = 'success' | 'denied' | 'error';

@Entity({ name: 'admin_audit_logs' })
@Index(['createdAt'])
@Index(['actor'])
@Index(['action'])
@Index(['resource'])
@Index(['status'])
export class AdminAuditLogEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  actor: string;

  @Column()
  action: string;

  @Column()
  resource: string;

  @Column()
  status: AdminAuditLogStatus;

  @Column({ type: 'text', nullable: true })
  metadataJson?: string | null;

  @Column({ type: 'text', nullable: true })
  diffJson?: string | null;

  @Column({ type: 'text', nullable: true })
  requestContextJson?: string | null;

  @Column({ nullable: true })
  previousHash?: string | null;

  @Column()
  contentHash: string;

  @Column()
  createdAt: string;
}
