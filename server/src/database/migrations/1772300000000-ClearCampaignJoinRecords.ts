import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClearCampaignJoinRecords1772300000000
  implements MigrationInterface
{
  name = 'ClearCampaignJoinRecords1772300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists: Array<{ name: string }> = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='campaign_join'`,
    );

    if (tableExists.length > 0) {
      await queryRunner.query(`DELETE FROM "campaign_join"`);
    }
  }

  public async down(): Promise<void> {
    // Deleted rows cannot be restored
  }
}
