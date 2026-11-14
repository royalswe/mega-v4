import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_payload_jobs_log_parent_task_slug" AS ENUM('inline', 'schedulePublish');
  CREATE TYPE "public"."enum_payload_llm_instructions_entity_type" AS ENUM('collection', 'global');
  CREATE TABLE "payload_llm_instructions" (
  	"id" varchar PRIMARY KEY NOT NULL,
  	"entity_slug" varchar NOT NULL,
  	"entity_type" "enum_payload_llm_instructions_entity_type" NOT NULL,
  	"additional_instructions" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_llm_instructions_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" varchar NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_jobs_stats" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"stats" jsonb,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  DROP INDEX "payload_jobs_processing_idx";
  UPDATE "payload_jobs_log" SET "input" = '{}'::jsonb WHERE "input" IS NULL;
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "input" SET NOT NULL;
  ALTER TABLE "users" ADD COLUMN "reset_password_requested_at" timestamp(3) with time zone;
  ALTER TABLE "media" ADD COLUMN "original_filename" varchar;
  ALTER TABLE "media" ADD COLUMN "original_url" varchar;
  ALTER TABLE "media" ADD COLUMN "original_mime_type" varchar;
  ALTER TABLE "media" ADD COLUMN "original_filesize" numeric;
  ALTER TABLE "media" ADD COLUMN "original_width" numeric;
  ALTER TABLE "media" ADD COLUMN "original_height" numeric;
  ALTER TABLE "media" ADD COLUMN "original_prefix" varchar;
  ALTER TABLE "media" ADD COLUMN "original__objectkey" varchar;
  ALTER TABLE "payload_jobs_log" ADD COLUMN "parent_task_slug" "enum_payload_jobs_log_parent_task_slug";
  ALTER TABLE "payload_jobs_log" ADD COLUMN "parent_task_i_d" varchar;
  ALTER TABLE "payload_jobs" ADD COLUMN "meta" jsonb;
  ALTER TABLE "payload_jobs" ADD COLUMN "processing_until" timestamp(3) with time zone;
  ALTER TABLE "payload_jobs" ADD COLUMN "processing_token" varchar;
  ALTER TABLE "payload_jobs" ADD COLUMN "concurrency_key" varchar;
  ALTER TABLE "payload_llm_instructions_rels" ADD CONSTRAINT "payload_llm_instructions_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_llm_instructions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_llm_instructions_rels" ADD CONSTRAINT "payload_llm_instructions_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_llm_instructions_entity_slug_idx" ON "payload_llm_instructions" USING btree ("entity_slug");
  CREATE INDEX "payload_llm_instructions_updated_at_idx" ON "payload_llm_instructions" USING btree ("updated_at");
  CREATE INDEX "payload_llm_instructions_created_at_idx" ON "payload_llm_instructions" USING btree ("created_at");
  CREATE INDEX "payload_llm_instructions_rels_order_idx" ON "payload_llm_instructions_rels" USING btree ("order");
  CREATE INDEX "payload_llm_instructions_rels_parent_idx" ON "payload_llm_instructions_rels" USING btree ("parent_id");
  CREATE INDEX "payload_llm_instructions_rels_path_idx" ON "payload_llm_instructions_rels" USING btree ("path");
  CREATE INDEX "payload_llm_instructions_rels_users_id_idx" ON "payload_llm_instructions_rels" USING btree ("users_id");
  CREATE INDEX "media_original_original_filename_idx" ON "media" USING btree ("original_filename");
  CREATE INDEX "payload_jobs_processing_until_idx" ON "payload_jobs" USING btree ("processing_until");
  CREATE INDEX "payload_jobs_concurrency_key_idx" ON "payload_jobs" USING btree ("concurrency_key");
  ALTER TABLE "payload_jobs" DROP COLUMN "processing";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_llm_instructions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_llm_instructions_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_jobs_stats" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload_llm_instructions" CASCADE;
  DROP TABLE "payload_llm_instructions_rels" CASCADE;
  DROP TABLE "payload_jobs_stats" CASCADE;
  DROP INDEX "media_original_original_filename_idx";
  DROP INDEX "payload_jobs_processing_until_idx";
  DROP INDEX "payload_jobs_concurrency_key_idx";
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "input" DROP NOT NULL;
  ALTER TABLE "payload_jobs" ADD COLUMN "processing" boolean DEFAULT false;
  CREATE INDEX "payload_jobs_processing_idx" ON "payload_jobs" USING btree ("processing");
  ALTER TABLE "users" DROP COLUMN "reset_password_requested_at";
  ALTER TABLE "media" DROP COLUMN "original_filename";
  ALTER TABLE "media" DROP COLUMN "original_url";
  ALTER TABLE "media" DROP COLUMN "original_mime_type";
  ALTER TABLE "media" DROP COLUMN "original_filesize";
  ALTER TABLE "media" DROP COLUMN "original_width";
  ALTER TABLE "media" DROP COLUMN "original_height";
  ALTER TABLE "media" DROP COLUMN "original_prefix";
  ALTER TABLE "media" DROP COLUMN "original__objectkey";
  ALTER TABLE "payload_jobs_log" DROP COLUMN "parent_task_slug";
  ALTER TABLE "payload_jobs_log" DROP COLUMN "parent_task_i_d";
  ALTER TABLE "payload_jobs" DROP COLUMN "meta";
  ALTER TABLE "payload_jobs" DROP COLUMN "processing_until";
  ALTER TABLE "payload_jobs" DROP COLUMN "processing_token";
  ALTER TABLE "payload_jobs" DROP COLUMN "concurrency_key";
  DROP TYPE "public"."enum_payload_jobs_log_parent_task_slug";
  DROP TYPE "public"."enum_payload_llm_instructions_entity_type";`)
}
