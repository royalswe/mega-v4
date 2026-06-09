import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "links" ADD COLUMN "ai_score" numeric;
  ALTER TABLE "links" ADD COLUMN "ai_reason" varchar;
  ALTER TABLE "links" ADD COLUMN "source" varchar;
  ALTER TABLE "_links_v" ADD COLUMN "version_ai_score" numeric;
  ALTER TABLE "_links_v" ADD COLUMN "version_ai_reason" varchar;
  ALTER TABLE "_links_v" ADD COLUMN "version_source" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "links" DROP COLUMN "ai_score";
  ALTER TABLE "links" DROP COLUMN "ai_reason";
  ALTER TABLE "links" DROP COLUMN "source";
  ALTER TABLE "_links_v" DROP COLUMN "version_ai_score";
  ALTER TABLE "_links_v" DROP COLUMN "version_ai_reason";
  ALTER TABLE "_links_v" DROP COLUMN "version_source";`)
}
