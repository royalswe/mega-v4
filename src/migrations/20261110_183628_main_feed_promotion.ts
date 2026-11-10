import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "links" ADD COLUMN "quarantined" boolean DEFAULT false;
  ALTER TABLE "links" ADD COLUMN "discovery_boosted" boolean DEFAULT false;
  ALTER TABLE "links" ADD COLUMN "boosted_at" timestamp(3) with time zone;
  ALTER TABLE "links" ADD COLUMN "boosted_by_id" integer;
  ALTER TABLE "_links_v" ADD COLUMN "version_quarantined" boolean DEFAULT false;
  ALTER TABLE "_links_v" ADD COLUMN "version_discovery_boosted" boolean DEFAULT false;
  ALTER TABLE "_links_v" ADD COLUMN "version_boosted_at" timestamp(3) with time zone;
  ALTER TABLE "_links_v" ADD COLUMN "version_boosted_by_id" integer;
  ALTER TABLE "posts" ADD COLUMN "quarantined" boolean DEFAULT false;
  ALTER TABLE "posts" ADD COLUMN "discovery_boosted" boolean DEFAULT false;
  ALTER TABLE "posts" ADD COLUMN "boosted_at" timestamp(3) with time zone;
  ALTER TABLE "posts" ADD COLUMN "boosted_by_id" integer;
  ALTER TABLE "links" ADD CONSTRAINT "links_boosted_by_id_users_id_fk" FOREIGN KEY ("boosted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_links_v" ADD CONSTRAINT "_links_v_version_boosted_by_id_users_id_fk" FOREIGN KEY ("version_boosted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_boosted_by_id_users_id_fk" FOREIGN KEY ("boosted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "links_quarantined_idx" ON "links" USING btree ("quarantined");
  CREATE INDEX "links_boosted_by_idx" ON "links" USING btree ("boosted_by_id");
  CREATE INDEX "_links_v_version_version_quarantined_idx" ON "_links_v" USING btree ("version_quarantined");
  CREATE INDEX "_links_v_version_version_boosted_by_idx" ON "_links_v" USING btree ("version_boosted_by_id");
  CREATE INDEX "posts_quarantined_idx" ON "posts" USING btree ("quarantined");
  CREATE INDEX "posts_boosted_by_idx" ON "posts" USING btree ("boosted_by_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "links" DROP CONSTRAINT "links_boosted_by_id_users_id_fk";
  
  ALTER TABLE "_links_v" DROP CONSTRAINT "_links_v_version_boosted_by_id_users_id_fk";
  
  ALTER TABLE "posts" DROP CONSTRAINT "posts_boosted_by_id_users_id_fk";
  
  DROP INDEX "links_quarantined_idx";
  DROP INDEX "links_boosted_by_idx";
  DROP INDEX "_links_v_version_version_quarantined_idx";
  DROP INDEX "_links_v_version_version_boosted_by_idx";
  DROP INDEX "posts_quarantined_idx";
  DROP INDEX "posts_boosted_by_idx";
  ALTER TABLE "links" DROP COLUMN "quarantined";
  ALTER TABLE "links" DROP COLUMN "discovery_boosted";
  ALTER TABLE "links" DROP COLUMN "boosted_at";
  ALTER TABLE "links" DROP COLUMN "boosted_by_id";
  ALTER TABLE "_links_v" DROP COLUMN "version_quarantined";
  ALTER TABLE "_links_v" DROP COLUMN "version_discovery_boosted";
  ALTER TABLE "_links_v" DROP COLUMN "version_boosted_at";
  ALTER TABLE "_links_v" DROP COLUMN "version_boosted_by_id";
  ALTER TABLE "posts" DROP COLUMN "quarantined";
  ALTER TABLE "posts" DROP COLUMN "discovery_boosted";
  ALTER TABLE "posts" DROP COLUMN "boosted_at";
  ALTER TABLE "posts" DROP COLUMN "boosted_by_id";`)
}
