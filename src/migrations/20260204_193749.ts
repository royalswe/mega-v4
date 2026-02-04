import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_settings_language" AS ENUM('en', 'sv');
  ALTER TABLE "users" ADD COLUMN "settings_language" "enum_users_settings_language" DEFAULT 'en' NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" DROP COLUMN "settings_language";
  DROP TYPE "public"."enum_users_settings_language";`)
}
