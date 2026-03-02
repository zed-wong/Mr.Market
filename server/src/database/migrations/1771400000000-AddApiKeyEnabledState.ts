import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddApiKeyEnabledState1771400000000
  implements MigrationInterface
{
  name = 'AddApiKeyEnabledState1771400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys_config'`,
    );

    if (!table.length) {
      return;
    }

    const columns = (await queryRunner.query(
      `PRAGMA table_info('api_keys_config')`,
    )) as Array<{ name: string }>;

    const hasEnabled = columns.some((column) => column.name === 'enabled');

    if (hasEnabled) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "api_keys_config" ADD COLUMN "enabled" boolean NOT NULL DEFAULT (1)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys_config'`,
    );

    if (!table.length) {
      return;
    }

    const columns = (await queryRunner.query(
      `PRAGMA table_info('api_keys_config')`,
    )) as Array<{ name: string }>;

    const hasEnabled = columns.some((column) => column.name === 'enabled');

    if (!hasEnabled) {
      return;
    }

    await queryRunner.startTransaction();

    try {
      await queryRunner.query(
        `CREATE TABLE "api_keys_config_tmp" (
          "key_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          "exchange" varchar NOT NULL,
          "exchange_index" varchar NOT NULL,
          "name" varchar NOT NULL,
          "api_key" varchar NOT NULL,
          "api_secret" varchar NOT NULL
        )`,
      );

      await queryRunner.query(
        `INSERT INTO "api_keys_config_tmp" ("key_id","exchange","exchange_index","name","api_key","api_secret")
         SELECT "key_id","exchange","exchange_index","name","api_key","api_secret"
         FROM "api_keys_config"`,
      );

      await queryRunner.query(`DROP TABLE "api_keys_config"`);
      await queryRunner.query(
        `ALTER TABLE "api_keys_config_tmp" RENAME TO "api_keys_config"`,
      );

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    }
  }
}
