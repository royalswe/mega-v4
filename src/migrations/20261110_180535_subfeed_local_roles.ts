import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "subfeeds" ADD COLUMN "owner_id" integer;
  ALTER TABLE "subfeeds" ADD CONSTRAINT "subfeeds_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "subfeeds_owner_idx" ON "subfeeds" USING btree ("owner_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "subfeeds" DROP CONSTRAINT "subfeeds_owner_id_users_id_fk";
  
  DROP INDEX "subfeeds_owner_idx";
  ALTER TABLE "subfeeds" DROP COLUMN "owner_id";`)
}
