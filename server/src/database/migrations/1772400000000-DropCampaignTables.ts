import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropCampaignTables1772400000000 implements MigrationInterface {
  name = 'DropCampaignTables1772400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = ['campaign', 'campaign_participation'];

    for (const table of tables) {
      const tableExists: Array<{ name: string }> = await queryRunner.query(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`,
      );

      if (tableExists.length > 0) {
        await queryRunner.query(`DROP TABLE "${table}"`);
      }
    }
  }

  public async down(): Promise<void> {}
}
