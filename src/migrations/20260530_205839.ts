import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "link_clicks" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"link_id" integer NOT NULL,
  	"user_id" integer,
  	"fingerprint" varchar,
  	"identity_key" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "link_clicks_id" integer;
  ALTER TABLE "link_clicks" ADD CONSTRAINT "link_clicks_link_id_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "link_clicks" ADD CONSTRAINT "link_clicks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "link_clicks_link_idx" ON "link_clicks" USING btree ("link_id");
  CREATE INDEX "link_clicks_user_idx" ON "link_clicks" USING btree ("user_id");
  CREATE INDEX "link_clicks_fingerprint_idx" ON "link_clicks" USING btree ("fingerprint");
  CREATE UNIQUE INDEX "link_clicks_identity_key_idx" ON "link_clicks" USING btree ("identity_key");
  CREATE INDEX "link_clicks_updated_at_idx" ON "link_clicks" USING btree ("updated_at");
  CREATE INDEX "link_clicks_created_at_idx" ON "link_clicks" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_link_clicks_fk" FOREIGN KEY ("link_clicks_id") REFERENCES "public"."link_clicks"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_link_clicks_id_idx" ON "payload_locked_documents_rels" USING btree ("link_clicks_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "link_clicks" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "link_clicks" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_link_clicks_fk";
  
  DROP INDEX "payload_locked_documents_rels_link_clicks_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "link_clicks_id";`)
}
