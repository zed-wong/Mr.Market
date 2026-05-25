import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSetupConfig1779800000000 implements MigrationInterface {
  name = 'AddSetupConfig1779800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "setup_config" ("key" varchar PRIMARY KEY NOT NULL, "value" text NOT NULL, "encrypted" boolean NOT NULL DEFAULT (0), "secret" boolean NOT NULL DEFAULT (0), "updatedAt" varchar)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "setup_config"`);
  }
}
