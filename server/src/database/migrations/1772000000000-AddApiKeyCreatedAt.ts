import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddApiKeyCreatedAt1772000000000 implements MigrationInterface {
  name = 'AddApiKeyCreatedAt1772000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "api_keys_config" ADD "created_at" varchar`,
    );
    await queryRunner.query(
      `UPDATE "api_keys_config" SET "created_at" = COALESCE("created_at", '${new Date().toISOString()}')`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_api_keys_config" ("key_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "exchange" varchar NOT NULL, "exchange_index" varchar NOT NULL, "name" varchar NOT NULL, "api_key" varchar NOT NULL, "api_secret" varchar NOT NULL, "created_at" varchar NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_api_keys_config"("key_id", "exchange", "exchange_index", "name", "api_key", "api_secret", "created_at") SELECT "key_id", "exchange", "exchange_index", "name", "api_key", "api_secret", "created_at" FROM "api_keys_config"`,
    );
    await queryRunner.query(`DROP TABLE "api_keys_config"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_api_keys_config" RENAME TO "api_keys_config"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_api_keys_config" ("key_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "exchange" varchar NOT NULL, "exchange_index" varchar NOT NULL, "name" varchar NOT NULL, "api_key" varchar NOT NULL, "api_secret" varchar NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_api_keys_config"("key_id", "exchange", "exchange_index", "name", "api_key", "api_secret") SELECT "key_id", "exchange", "exchange_index", "name", "api_key", "api_secret" FROM "api_keys_config"`,
    );
    await queryRunner.query(`DROP TABLE "api_keys_config"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_api_keys_config" RENAME TO "api_keys_config"`,
    );
  }
}
