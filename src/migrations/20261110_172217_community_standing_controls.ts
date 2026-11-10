import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_revoked_roles" AS ENUM('uploader', 'editor', 'moderator', 'cleaner', 'recruiter');
  CREATE TABLE "users_revoked_roles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_users_revoked_roles",
  	"id" serial PRIMARY KEY NOT NULL
  );

  ALTER TABLE "users_sessions" ADD COLUMN "refresh_count" numeric;
  ALTER TABLE "users_sessions" ADD COLUMN "refreshed_at" timestamp(3) with time zone;
  ALTER TABLE "users" ADD COLUMN "standing_locked" boolean DEFAULT false;
  ALTER TABLE "users_revoked_roles" ADD CONSTRAINT "users_revoked_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_revoked_roles_order_idx" ON "users_revoked_roles" USING btree ("order");
  CREATE INDEX "users_revoked_roles_parent_idx" ON "users_revoked_roles" USING btree ("parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_revoked_roles" CASCADE;
  ALTER TABLE "users_sessions" DROP COLUMN "refresh_count";
  ALTER TABLE "users_sessions" DROP COLUMN "refreshed_at";
  ALTER TABLE "users" DROP COLUMN "standing_locked";
  DROP TYPE "public"."enum_users_revoked_roles";`)
}
