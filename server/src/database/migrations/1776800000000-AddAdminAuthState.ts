import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminAuthState1776800000000 implements MigrationInterface {
  name = 'AddAdminAuthState1776800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "admin_auth_state" ("id" varchar PRIMARY KEY NOT NULL DEFAULT ('admin'), "tokenVersion" integer NOT NULL DEFAULT (1), "failedLoginAttempts" integer NOT NULL DEFAULT (0), "lockedUntil" varchar, "currentChallenge" varchar, "updatedAt" varchar)`,
    );
    await queryRunner.query(
      `INSERT INTO "admin_auth_state"("id", "tokenVersion", "failedLoginAttempts") VALUES ('admin', 1, 0)`,
    );
    await queryRunner.query(
      `CREATE TABLE "admin_passkey_credentials" ("credentialId" varchar PRIMARY KEY NOT NULL, "publicKey" varchar NOT NULL, "counter" integer NOT NULL DEFAULT (0), "transports" varchar, "createdAt" varchar NOT NULL, "updatedAt" varchar NOT NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "admin_passkey_credentials"`);
    await queryRunner.query(`DROP TABLE "admin_auth_state"`);
  }
}
