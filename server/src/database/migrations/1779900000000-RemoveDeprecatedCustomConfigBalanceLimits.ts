import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveDeprecatedCustomConfigBalanceLimits1779900000000
  implements MigrationInterface
{
  name = 'RemoveDeprecatedCustomConfigBalanceLimits1779900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "custom_config_entity" DROP COLUMN "max_balance_mixin_bot"`,
    );
    await queryRunner.query(
      `ALTER TABLE "custom_config_entity" DROP COLUMN "max_balance_single_api_key"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "custom_config_entity" ADD COLUMN "max_balance_single_api_key" varchar NOT NULL DEFAULT ('0')`,
    );
    await queryRunner.query(
      `ALTER TABLE "custom_config_entity" ADD COLUMN "max_balance_mixin_bot" varchar NOT NULL DEFAULT ('0')`,
    );
  }
}
