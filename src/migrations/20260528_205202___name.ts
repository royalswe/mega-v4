import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "links" RENAME COLUMN "moderation_status" TO "soft_deleted";
  ALTER TABLE "links" ALTER COLUMN "soft_deleted" DROP DEFAULT;
  ALTER TABLE "links" ALTER COLUMN "soft_deleted" TYPE boolean USING ("soft_deleted"::text = 'removed');
  ALTER TABLE "links" ALTER COLUMN "soft_deleted" SET DEFAULT false;
  ALTER TABLE "_links_v" RENAME COLUMN "version_moderation_status" TO "version_soft_deleted";
  ALTER TABLE "_links_v" ALTER COLUMN "version_soft_deleted" DROP DEFAULT;
  ALTER TABLE "_links_v" ALTER COLUMN "version_soft_deleted" TYPE boolean USING ("version_soft_deleted"::text = 'removed');
  ALTER TABLE "_links_v" ALTER COLUMN "version_soft_deleted" SET DEFAULT false;
  DROP INDEX "links_moderation_status_idx";
  DROP INDEX "_links_v_version_version_moderation_status_idx";
  CREATE INDEX "links_soft_deleted_idx" ON "links" USING btree ("soft_deleted");
  CREATE INDEX "_links_v_version_version_soft_deleted_idx" ON "_links_v" USING btree ("version_soft_deleted");
  DROP TYPE "public"."enum_links_moderation_status";
  DROP TYPE "public"."enum__links_v_version_moderation_status";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_links_moderation_status" AS ENUM('pending', 'approved', 'removed');
  CREATE TYPE "public"."enum__links_v_version_moderation_status" AS ENUM('pending', 'approved', 'removed');
  ALTER TABLE "links" RENAME COLUMN "soft_deleted" TO "moderation_status";
  ALTER TABLE "links" ALTER COLUMN "moderation_status" DROP DEFAULT;
  ALTER TABLE "links" ALTER COLUMN "moderation_status" TYPE "enum_links_moderation_status" USING (
    CASE
      WHEN "moderation_status" = true THEN 'removed'
      ELSE 'approved'
    END::"enum_links_moderation_status"
  );
  ALTER TABLE "links" ALTER COLUMN "moderation_status" SET DEFAULT 'pending';
  ALTER TABLE "_links_v" RENAME COLUMN "version_soft_deleted" TO "version_moderation_status";
  ALTER TABLE "_links_v" ALTER COLUMN "version_moderation_status" DROP DEFAULT;
  ALTER TABLE "_links_v" ALTER COLUMN "version_moderation_status" TYPE "enum__links_v_version_moderation_status" USING (
    CASE
      WHEN "version_moderation_status" = true THEN 'removed'
      ELSE 'approved'
    END::"enum__links_v_version_moderation_status"
  );
  ALTER TABLE "_links_v" ALTER COLUMN "version_moderation_status" SET DEFAULT 'pending';
  DROP INDEX "links_soft_deleted_idx";
  DROP INDEX "_links_v_version_version_soft_deleted_idx";
  CREATE INDEX "links_moderation_status_idx" ON "links" USING btree ("moderation_status");
  CREATE INDEX "_links_v_version_version_moderation_status_idx" ON "_links_v" USING btree ("version_moderation_status");`)
}
