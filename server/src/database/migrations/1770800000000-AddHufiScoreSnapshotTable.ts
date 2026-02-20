import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHufiScoreSnapshotTable1770800000000
  implements MigrationInterface
{
  name = 'AddHufiScoreSnapshotTable1770800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "hufi_score_snapshot" ("id" varchar PRIMARY KEY NOT NULL, "day" varchar NOT NULL, "pair" varchar NOT NULL, "exchange" varchar NOT NULL, "makerVolume" varchar NOT NULL, "takerVolume" varchar NOT NULL, "score" varchar NOT NULL, "createdAt" varchar NOT NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "hufi_score_snapshot"`);
  }
}
