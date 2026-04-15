import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveApiKeyExchangeIndex1775900000000
  implements MigrationInterface
{
  name = 'RemoveApiKeyExchangeIndex1775900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_api_keys_config" ("key_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "exchange" varchar NOT NULL, "name" varchar NOT NULL, "api_key" varchar NOT NULL, "api_secret" varchar NOT NULL, "created_at" varchar NOT NULL, "permissions" varchar NOT NULL DEFAULT ('read'))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_api_keys_config"("key_id", "exchange", "name", "api_key", "api_secret", "created_at", "permissions") SELECT "key_id", "exchange", "name", "api_key", "api_secret", "created_at", "permissions" FROM "api_keys_config"`,
    );
    await queryRunner.query(`DROP TABLE "api_keys_config"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_api_keys_config" RENAME TO "api_keys_config"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_api_keys_config" ("key_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "exchange" varchar NOT NULL, "exchange_index" varchar NOT NULL, "name" varchar NOT NULL, "api_key" varchar NOT NULL, "api_secret" varchar NOT NULL, "created_at" varchar NOT NULL, "permissions" varchar NOT NULL DEFAULT ('read'))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_api_keys_config"("key_id", "exchange", "exchange_index", "name", "api_key", "api_secret", "created_at", "permissions") SELECT "key_id", "exchange", "name", "name", "api_key", "api_secret", "created_at", "permissions" FROM "api_keys_config"`,
    );
    await queryRunner.query(`DROP TABLE "api_keys_config"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_api_keys_config" RENAME TO "api_keys_config"`,
    );
  }
}
