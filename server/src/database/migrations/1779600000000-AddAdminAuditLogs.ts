import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminAuditLogs1779600000000 implements MigrationInterface {
  name = 'AddAdminAuditLogs1779600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "admin_audit_logs" ("id" varchar PRIMARY KEY NOT NULL, "actor" varchar NOT NULL, "action" varchar NOT NULL, "resource" varchar NOT NULL, "status" varchar NOT NULL, "metadataJson" text, "diffJson" text, "requestContextJson" text, "previousHash" varchar, "contentHash" varchar NOT NULL, "createdAt" varchar NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_audit_logs_createdAt" ON "admin_audit_logs" ("createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_audit_logs_actor" ON "admin_audit_logs" ("actor")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_audit_logs_action" ON "admin_audit_logs" ("action")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_audit_logs_resource" ON "admin_audit_logs" ("resource")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_audit_logs_status" ON "admin_audit_logs" ("status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_admin_audit_logs_status"`);
    await queryRunner.query(`DROP INDEX "IDX_admin_audit_logs_resource"`);
    await queryRunner.query(`DROP INDEX "IDX_admin_audit_logs_action"`);
    await queryRunner.query(`DROP INDEX "IDX_admin_audit_logs_actor"`);
    await queryRunner.query(`DROP INDEX "IDX_admin_audit_logs_createdAt"`);
    await queryRunner.query(`DROP TABLE "admin_audit_logs"`);
  }
}
