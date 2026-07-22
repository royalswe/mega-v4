import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_users_roles" ADD VALUE 'cleaner' BEFORE 'uploader';
  ALTER TYPE "public"."enum_users_roles" ADD VALUE 'recruiter' BEFORE 'user';
  ALTER TABLE "users" ADD COLUMN "likability_score" numeric DEFAULT 0;
  ALTER TABLE "users" ADD COLUMN "cleaning_score" numeric DEFAULT 0;
  ALTER TABLE "users" ADD COLUMN "recruiter_score" numeric DEFAULT 0;
  ALTER TABLE "users" ADD COLUMN "is_cleaner" boolean DEFAULT false;
  ALTER TABLE "users" ADD COLUMN "is_recruiter" boolean DEFAULT false;
  ALTER TABLE "users" ADD COLUMN "total_member_value" numeric DEFAULT 0;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users_roles" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_users_roles";
  CREATE TYPE "public"."enum_users_roles" AS ENUM('admin', 'editor', 'moderator', 'uploader', 'user');
  ALTER TABLE "users_roles" ALTER COLUMN "value" SET DATA TYPE "public"."enum_users_roles" USING "value"::"public"."enum_users_roles";
  ALTER TABLE "users" DROP COLUMN "likability_score";
  ALTER TABLE "users" DROP COLUMN "cleaning_score";
  ALTER TABLE "users" DROP COLUMN "recruiter_score";
  ALTER TABLE "users" DROP COLUMN "is_cleaner";
  ALTER TABLE "users" DROP COLUMN "is_recruiter";
  ALTER TABLE "users" DROP COLUMN "total_member_value";`)
}
