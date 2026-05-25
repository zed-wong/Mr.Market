import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSetupState1779700000000 implements MigrationInterface {
  name = 'AddSetupState1779700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "setup_state" ("id" integer PRIMARY KEY NOT NULL DEFAULT (1), "initialized" boolean NOT NULL DEFAULT (0), "completedSteps" text NOT NULL DEFAULT ('{}'), "seededAt" varchar, "completedAt" varchar, "updatedAt" varchar)`,
    );
    await queryRunner.query(
      `INSERT INTO "setup_state"("id", "initialized", "completedSteps") VALUES (1, 0, '{}')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "setup_state"`);
  }
}
