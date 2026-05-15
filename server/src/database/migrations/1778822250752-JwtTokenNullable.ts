import { MigrationInterface, QueryRunner } from "typeorm";

export class JwtTokenNullable1778822250752 implements MigrationInterface {
    name = 'JwtTokenNullable1778822250752'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "IDX_outbox_event_aggregate_id"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_outbox_event_aggregate_type"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_outbox_event_topic"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_consumer_receipt_consumer_idempotency"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_consumer_receipt_idempotency_key"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_consumer_receipt_consumer_name"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_tracked_order_strategyKey"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_tracked_order_trackingKey"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_strategy_order_intent_status"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_strategy_order_intent_strategy_key"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_strategy_instances_strategy_definition_id"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_strategy_execution_history_type"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_strategy_execution_history_executed_at"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_strategy_execution_history_user"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_market_making_order_balance_user_id"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_ledger_entry_asset_id"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_ledger_entry_user_id"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_ledger_entry_order_id"
        `);
        await queryRunner.query(`
            CREATE TABLE "temporary_campaign_join" (
                "id" varchar PRIMARY KEY NOT NULL,
                "evmAddress" varchar NOT NULL,
                "apiKeyId" varchar NOT NULL,
                "chainId" integer NOT NULL,
                "campaignAddress" varchar NOT NULL,
                "orderId" varchar,
                "status" varchar NOT NULL,
                "createdAt" varchar NOT NULL,
                "updatedAt" varchar NOT NULL
            )
        `);
        await queryRunner.query(`
            INSERT INTO "temporary_campaign_join"(
                    "id",
                    "evmAddress",
                    "apiKeyId",
                    "chainId",
                    "campaignAddress",
                    "orderId",
                    "status",
                    "createdAt",
                    "updatedAt"
                )
            SELECT "id",
                "evmAddress",
                "apiKeyId",
                "chainId",
                "campaignAddress",
                "orderId",
                "status",
                "createdAt",
                "updatedAt"
            FROM "campaign_join"
        `);
        await queryRunner.query(`
            DROP TABLE "campaign_join"
        `);
        await queryRunner.query(`
            ALTER TABLE "temporary_campaign_join"
                RENAME TO "campaign_join"
        `);
        await queryRunner.query(`
            CREATE TABLE "temporary_mixin_user" (
                "user_id" varchar PRIMARY KEY NOT NULL,
                "type" varchar,
                "identity_number" varchar NOT NULL,
                "phone" varchar,
                "full_name" varchar NOT NULL,
                "avatar_url" varchar,
                "jwt_token" varchar NOT NULL,
                "created_at" varchar NOT NULL,
                "last_updated" varchar NOT NULL,
                "walletAddress" varchar
            )
        `);
        await queryRunner.query(`
            INSERT INTO "temporary_mixin_user"(
                    "user_id",
                    "type",
                    "identity_number",
                    "phone",
                    "full_name",
                    "avatar_url",
                    "jwt_token",
                    "created_at",
                    "last_updated",
                    "walletAddress"
                )
            SELECT "user_id",
                "type",
                "identity_number",
                "phone",
                "full_name",
                "avatar_url",
                "jwt_token",
                "created_at",
                "last_updated",
                "walletAddress"
            FROM "mixin_user"
        `);
        await queryRunner.query(`
            DROP TABLE "mixin_user"
        `);
        await queryRunner.query(`
            ALTER TABLE "temporary_mixin_user"
                RENAME TO "mixin_user"
        `);
        await queryRunner.query(`
            CREATE TABLE "temporary_payment_state" (
                "orderId" varchar PRIMARY KEY NOT NULL,
                "type" varchar NOT NULL,
                "state" varchar,
                "createdAt" varchar NOT NULL,
                "updatedAt" varchar NOT NULL,
                "userId" varchar
            )
        `);
        await queryRunner.query(`
            INSERT INTO "temporary_payment_state"(
                    "orderId",
                    "type",
                    "state",
                    "createdAt",
                    "updatedAt",
                    "userId"
                )
            SELECT "orderId",
                "type",
                "state",
                "createdAt",
                "updatedAt",
                "userId"
            FROM "payment_state"
        `);
        await queryRunner.query(`
            DROP TABLE "payment_state"
        `);
        await queryRunner.query(`
            ALTER TABLE "temporary_payment_state"
                RENAME TO "payment_state"
        `);
        await queryRunner.query(`
            CREATE TABLE "temporary_payment_state" (
                "orderId" varchar PRIMARY KEY NOT NULL,
                "type" varchar NOT NULL,
                "state" varchar,
                "createdAt" varchar NOT NULL,
                "updatedAt" varchar NOT NULL,
                "userId" varchar NOT NULL
            )
        `);
        await queryRunner.query(`
            INSERT INTO "temporary_payment_state"(
                    "orderId",
                    "type",
                    "state",
                    "createdAt",
                    "updatedAt",
                    "userId"
                )
            SELECT "orderId",
                "type",
                "state",
                "createdAt",
                "updatedAt",
                "userId"
            FROM "payment_state"
        `);
        await queryRunner.query(`
            DROP TABLE "payment_state"
        `);
        await queryRunner.query(`
            ALTER TABLE "temporary_payment_state"
                RENAME TO "payment_state"
        `);
        await queryRunner.query(`
            CREATE TABLE "temporary_mixin_user" (
                "user_id" varchar PRIMARY KEY NOT NULL,
                "type" varchar,
                "identity_number" varchar NOT NULL,
                "phone" varchar,
                "full_name" varchar NOT NULL,
                "avatar_url" varchar,
                "jwt_token" varchar,
                "created_at" varchar NOT NULL,
                "last_updated" varchar NOT NULL,
                "walletAddress" varchar
            )
        `);
        await queryRunner.query(`
            INSERT INTO "temporary_mixin_user"(
                    "user_id",
                    "type",
                    "identity_number",
                    "phone",
                    "full_name",
                    "avatar_url",
                    "jwt_token",
                    "created_at",
                    "last_updated",
                    "walletAddress"
                )
            SELECT "user_id",
                "type",
                "identity_number",
                "phone",
                "full_name",
                "avatar_url",
                "jwt_token",
                "created_at",
                "last_updated",
                "walletAddress"
            FROM "mixin_user"
        `);
        await queryRunner.query(`
            DROP TABLE "mixin_user"
        `);
        await queryRunner.query(`
            ALTER TABLE "temporary_mixin_user"
                RENAME TO "mixin_user"
        `);
        await queryRunner.query(`
            CREATE TABLE "temporary_reward_allocation" (
                "allocationId" varchar PRIMARY KEY NOT NULL,
                "rewardTxHash" varchar NOT NULL,
                "campaignId" varchar NOT NULL,
                "dayIndex" integer NOT NULL,
                "userId" varchar NOT NULL,
                "token" varchar NOT NULL,
                "amount" varchar NOT NULL,
                "basisShares" varchar NOT NULL,
                "status" varchar NOT NULL DEFAULT ('CREATED'),
                "createdAt" varchar NOT NULL,
                "orderId" varchar NOT NULL
            )
        `);
        await queryRunner.query(`
            INSERT INTO "temporary_reward_allocation"(
                    "allocationId",
                    "rewardTxHash",
                    "campaignId",
                    "dayIndex",
                    "userId",
                    "token",
                    "amount",
                    "basisShares",
                    "status",
                    "createdAt",
                    "orderId"
                )
            SELECT "allocationId",
                "rewardTxHash",
                "campaignId",
                "dayIndex",
                "userId",
                "token",
                "amount",
                "basisShares",
                "status",
                "createdAt",
                "orderId"
            FROM "reward_allocation"
        `);
        await queryRunner.query(`
            DROP TABLE "reward_allocation"
        `);
        await queryRunner.query(`
            ALTER TABLE "temporary_reward_allocation"
                RENAME TO "reward_allocation"
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_681aaaab71b6d6afe317fdcd14" ON "outbox_event" ("topic")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_5ec0c783eabac2451e04101870" ON "outbox_event" ("aggregateType")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_7742b10fde39bd407bd9c162a4" ON "outbox_event" ("aggregateId")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_b944b4ecd092c7052869a2fc6f" ON "consumer_receipt" ("consumerName")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_259b68ead4d82a9d54a24759aa" ON "consumer_receipt" ("idempotencyKey")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_b2dd5f15a376a973ed41cdadf5" ON "consumer_receipt" ("consumerName", "idempotencyKey")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_117b4b02ef4d18a96445c6f223" ON "tracked_order" ("trackingKey")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_626e1085f4b77f5e5cfa4fdd96" ON "tracked_order" ("strategyKey")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_3ee75173ac2f97630bb8034c2c" ON "strategy_order_intent" ("strategyKey")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_32ac9fcf4bc71e032bda18aaf2" ON "strategy_order_intent" ("status")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_7fe31c48be841a3945a29c6298" ON "strategy_instances" ("strategyDefinitionId")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_ea79c038e6ea5b5759839f369e" ON "market_making_order_balance" ("userId")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_648635a12ec8f4f524c203f0ab" ON "ledger_entry" ("orderId")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_d90bdf76a4e458e2b0963a73b0" ON "ledger_entry" ("userId")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_c016e418abaf6664d00dc190f7" ON "ledger_entry" ("assetId")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_6fe8d9d8958eadeaeac723738b" ON "campaign_join" ("evmAddress")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "IDX_6fe8d9d8958eadeaeac723738b"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_c016e418abaf6664d00dc190f7"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_d90bdf76a4e458e2b0963a73b0"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_648635a12ec8f4f524c203f0ab"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_ea79c038e6ea5b5759839f369e"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_7fe31c48be841a3945a29c6298"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_32ac9fcf4bc71e032bda18aaf2"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_3ee75173ac2f97630bb8034c2c"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_626e1085f4b77f5e5cfa4fdd96"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_117b4b02ef4d18a96445c6f223"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_b2dd5f15a376a973ed41cdadf5"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_259b68ead4d82a9d54a24759aa"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_b944b4ecd092c7052869a2fc6f"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_7742b10fde39bd407bd9c162a4"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_5ec0c783eabac2451e04101870"
        `);
        await queryRunner.query(`
            DROP INDEX "IDX_681aaaab71b6d6afe317fdcd14"
        `);
        await queryRunner.query(`
            ALTER TABLE "reward_allocation"
                RENAME TO "temporary_reward_allocation"
        `);
        await queryRunner.query(`
            CREATE TABLE "reward_allocation" (
                "allocationId" varchar PRIMARY KEY NOT NULL,
                "rewardTxHash" varchar NOT NULL,
                "campaignId" varchar NOT NULL,
                "dayIndex" integer NOT NULL,
                "userId" varchar NOT NULL,
                "token" varchar NOT NULL,
                "amount" varchar NOT NULL,
                "basisShares" varchar NOT NULL,
                "status" varchar NOT NULL DEFAULT ('CREATED'),
                "createdAt" varchar NOT NULL,
                "orderId" varchar NOT NULL DEFAULT ('')
            )
        `);
        await queryRunner.query(`
            INSERT INTO "reward_allocation"(
                    "allocationId",
                    "rewardTxHash",
                    "campaignId",
                    "dayIndex",
                    "userId",
                    "token",
                    "amount",
                    "basisShares",
                    "status",
                    "createdAt",
                    "orderId"
                )
            SELECT "allocationId",
                "rewardTxHash",
                "campaignId",
                "dayIndex",
                "userId",
                "token",
                "amount",
                "basisShares",
                "status",
                "createdAt",
                "orderId"
            FROM "temporary_reward_allocation"
        `);
        await queryRunner.query(`
            DROP TABLE "temporary_reward_allocation"
        `);
        await queryRunner.query(`
            ALTER TABLE "mixin_user"
                RENAME TO "temporary_mixin_user"
        `);
        await queryRunner.query(`
            CREATE TABLE "mixin_user" (
                "user_id" varchar PRIMARY KEY NOT NULL,
                "type" varchar,
                "identity_number" varchar NOT NULL,
                "phone" varchar,
                "full_name" varchar NOT NULL,
                "avatar_url" varchar,
                "jwt_token" varchar NOT NULL,
                "created_at" varchar NOT NULL,
                "last_updated" varchar NOT NULL,
                "walletAddress" varchar
            )
        `);
        await queryRunner.query(`
            INSERT INTO "mixin_user"(
                    "user_id",
                    "type",
                    "identity_number",
                    "phone",
                    "full_name",
                    "avatar_url",
                    "jwt_token",
                    "created_at",
                    "last_updated",
                    "walletAddress"
                )
            SELECT "user_id",
                "type",
                "identity_number",
                "phone",
                "full_name",
                "avatar_url",
                "jwt_token",
                "created_at",
                "last_updated",
                "walletAddress"
            FROM "temporary_mixin_user"
        `);
        await queryRunner.query(`
            DROP TABLE "temporary_mixin_user"
        `);
        await queryRunner.query(`
            ALTER TABLE "payment_state"
                RENAME TO "temporary_payment_state"
        `);
        await queryRunner.query(`
            CREATE TABLE "payment_state" (
                "orderId" varchar PRIMARY KEY NOT NULL,
                "type" varchar NOT NULL,
                "state" varchar,
                "createdAt" varchar NOT NULL,
                "updatedAt" varchar NOT NULL,
                "userId" varchar
            )
        `);
        await queryRunner.query(`
            INSERT INTO "payment_state"(
                    "orderId",
                    "type",
                    "state",
                    "createdAt",
                    "updatedAt",
                    "userId"
                )
            SELECT "orderId",
                "type",
                "state",
                "createdAt",
                "updatedAt",
                "userId"
            FROM "temporary_payment_state"
        `);
        await queryRunner.query(`
            DROP TABLE "temporary_payment_state"
        `);
        await queryRunner.query(`
            ALTER TABLE "payment_state"
                RENAME TO "temporary_payment_state"
        `);
        await queryRunner.query(`
            CREATE TABLE "payment_state" (
                "orderId" varchar PRIMARY KEY NOT NULL,
                "type" varchar NOT NULL,
                "symbol" varchar NOT NULL,
                "baseAssetId" varchar NOT NULL,
                "baseAssetAmount" varchar NOT NULL DEFAULT ('0'),
                "baseAssetSnapshotId" varchar,
                "quoteAssetId" varchar NOT NULL,
                "quoteAssetAmount" varchar NOT NULL DEFAULT ('0'),
                "quoteAssetSnapshotId" varchar,
                "baseFeeAssetId" varchar,
                "baseFeeAssetAmount" varchar NOT NULL DEFAULT ('0'),
                "baseFeeAssetSnapshotId" varchar,
                "quoteFeeAssetId" varchar,
                "quoteFeeAssetAmount" varchar NOT NULL DEFAULT ('0'),
                "quoteFeeAssetSnapshotId" varchar,
                "requiredBaseWithdrawalFee" varchar,
                "requiredQuoteWithdrawalFee" varchar,
                "requiredMarketMakingFee" varchar,
                "state" varchar,
                "createdAt" varchar NOT NULL,
                "updatedAt" varchar NOT NULL,
                "userId" varchar,
                "baseStrategyFeeAssetId" varchar,
                "baseStrategyFeeAmount" varchar DEFAULT ('0'),
                "baseStrategyFeeSnapshotId" varchar,
                "quoteStrategyFeeAssetId" varchar,
                "quoteStrategyFeeAmount" varchar DEFAULT ('0'),
                "quoteStrategyFeeSnapshotId" varchar,
                "requiredStrategyFeePercentage" varchar
            )
        `);
        await queryRunner.query(`
            INSERT INTO "payment_state"(
                    "orderId",
                    "type",
                    "state",
                    "createdAt",
                    "updatedAt",
                    "userId"
                )
            SELECT "orderId",
                "type",
                "state",
                "createdAt",
                "updatedAt",
                "userId"
            FROM "temporary_payment_state"
        `);
        await queryRunner.query(`
            DROP TABLE "temporary_payment_state"
        `);
        await queryRunner.query(`
            ALTER TABLE "mixin_user"
                RENAME TO "temporary_mixin_user"
        `);
        await queryRunner.query(`
            CREATE TABLE "mixin_user" (
                "user_id" varchar PRIMARY KEY NOT NULL,
                "type" varchar,
                "identity_number" varchar NOT NULL,
                "phone" varchar,
                "full_name" varchar NOT NULL,
                "avatar_url" varchar,
                "jwt_token" varchar NOT NULL,
                "created_at" varchar NOT NULL,
                "last_updated" varchar NOT NULL,
                "walletAddress" varchar
            )
        `);
        await queryRunner.query(`
            INSERT INTO "mixin_user"(
                    "user_id",
                    "type",
                    "identity_number",
                    "phone",
                    "full_name",
                    "avatar_url",
                    "jwt_token",
                    "created_at",
                    "last_updated",
                    "walletAddress"
                )
            SELECT "user_id",
                "type",
                "identity_number",
                "phone",
                "full_name",
                "avatar_url",
                "jwt_token",
                "created_at",
                "last_updated",
                "walletAddress"
            FROM "temporary_mixin_user"
        `);
        await queryRunner.query(`
            DROP TABLE "temporary_mixin_user"
        `);
        await queryRunner.query(`
            ALTER TABLE "campaign_join"
                RENAME TO "temporary_campaign_join"
        `);
        await queryRunner.query(`
            CREATE TABLE "campaign_join" (
                "id" varchar PRIMARY KEY NOT NULL,
                "evmAddress" varchar NOT NULL,
                "apiKeyId" varchar NOT NULL,
                "chainId" integer NOT NULL,
                "campaignAddress" varchar NOT NULL,
                "orderId" varchar,
                "status" varchar NOT NULL,
                "createdAt" varchar NOT NULL,
                "updatedAt" varchar NOT NULL,
                CONSTRAINT "UQ_campaign_join_binding" UNIQUE (
                    "evmAddress",
                    "apiKeyId",
                    "campaignAddress",
                    "chainId"
                )
            )
        `);
        await queryRunner.query(`
            INSERT INTO "campaign_join"(
                    "id",
                    "evmAddress",
                    "apiKeyId",
                    "chainId",
                    "campaignAddress",
                    "orderId",
                    "status",
                    "createdAt",
                    "updatedAt"
                )
            SELECT "id",
                "evmAddress",
                "apiKeyId",
                "chainId",
                "campaignAddress",
                "orderId",
                "status",
                "createdAt",
                "updatedAt"
            FROM "temporary_campaign_join"
        `);
        await queryRunner.query(`
            DROP TABLE "temporary_campaign_join"
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_ledger_entry_order_id" ON "ledger_entry" ("orderId")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_ledger_entry_user_id" ON "ledger_entry" ("userId")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_ledger_entry_asset_id" ON "ledger_entry" ("assetId")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_market_making_order_balance_user_id" ON "market_making_order_balance" ("userId")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_strategy_execution_history_user" ON "strategy_execution_history" ("userId")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_strategy_execution_history_executed_at" ON "strategy_execution_history" ("executedAt")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_strategy_execution_history_type" ON "strategy_execution_history" ("strategyType")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_strategy_instances_strategy_definition_id" ON "strategy_instances" ("strategyDefinitionId")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_strategy_order_intent_strategy_key" ON "strategy_order_intent" ("strategyKey")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_strategy_order_intent_status" ON "strategy_order_intent" ("status")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_tracked_order_trackingKey" ON "tracked_order" ("trackingKey")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_tracked_order_strategyKey" ON "tracked_order" ("strategyKey")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_consumer_receipt_consumer_name" ON "consumer_receipt" ("consumerName")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_consumer_receipt_idempotency_key" ON "consumer_receipt" ("idempotencyKey")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_consumer_receipt_consumer_idempotency" ON "consumer_receipt" ("consumerName", "idempotencyKey")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_outbox_event_topic" ON "outbox_event" ("topic")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_outbox_event_aggregate_type" ON "outbox_event" ("aggregateType")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_outbox_event_aggregate_id" ON "outbox_event" ("aggregateId")
        `);
    }

}
