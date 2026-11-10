import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "links" ADD COLUMN "editorial_priority" boolean DEFAULT false;
  ALTER TABLE "links" ADD COLUMN "editorial_priority_until" timestamp(3) with time zone;
  ALTER TABLE "_links_v" ADD COLUMN "version_editorial_priority" boolean DEFAULT false;
  ALTER TABLE "_links_v" ADD COLUMN "version_editorial_priority_until" timestamp(3) with time zone;
  ALTER TABLE "posts" ADD COLUMN "editorial_priority" boolean DEFAULT false;
  ALTER TABLE "posts" ADD COLUMN "editorial_priority_until" timestamp(3) with time zone;
  CREATE INDEX "links_editorial_priority_idx" ON "links" USING btree ("editorial_priority");
  CREATE INDEX "links_editorial_priority_until_idx" ON "links" USING btree ("editorial_priority_until");
  CREATE INDEX "_links_v_version_version_editorial_priority_idx" ON "_links_v" USING btree ("version_editorial_priority");
  CREATE INDEX "_links_v_version_version_editorial_priority_until_idx" ON "_links_v" USING btree ("version_editorial_priority_until");
  CREATE INDEX "posts_editorial_priority_idx" ON "posts" USING btree ("editorial_priority");
  CREATE INDEX "posts_editorial_priority_until_idx" ON "posts" USING btree ("editorial_priority_until");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "links_editorial_priority_idx";
  DROP INDEX "links_editorial_priority_until_idx";
  DROP INDEX "_links_v_version_version_editorial_priority_idx";
  DROP INDEX "_links_v_version_version_editorial_priority_until_idx";
  DROP INDEX "posts_editorial_priority_idx";
  DROP INDEX "posts_editorial_priority_until_idx";
  ALTER TABLE "links" DROP COLUMN "editorial_priority";
  ALTER TABLE "links" DROP COLUMN "editorial_priority_until";
  ALTER TABLE "_links_v" DROP COLUMN "version_editorial_priority";
  ALTER TABLE "_links_v" DROP COLUMN "version_editorial_priority_until";
  ALTER TABLE "posts" DROP COLUMN "editorial_priority";
  ALTER TABLE "posts" DROP COLUMN "editorial_priority_until";`)
}
