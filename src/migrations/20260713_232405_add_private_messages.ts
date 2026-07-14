import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "private_messages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"sender_id" integer NOT NULL,
  	"receiver_id" integer NOT NULL,
  	"message" varchar NOT NULL,
  	"is_read" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "private_messages_id" integer;
  ALTER TABLE "private_messages" ADD CONSTRAINT "private_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "private_messages" ADD CONSTRAINT "private_messages_receiver_id_users_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "private_messages_sender_idx" ON "private_messages" USING btree ("sender_id");
  CREATE INDEX "private_messages_receiver_idx" ON "private_messages" USING btree ("receiver_id");
  CREATE INDEX "private_messages_is_read_idx" ON "private_messages" USING btree ("is_read");
  CREATE INDEX "private_messages_updated_at_idx" ON "private_messages" USING btree ("updated_at");
  CREATE INDEX "private_messages_created_at_idx" ON "private_messages" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_private_messages_fk" FOREIGN KEY ("private_messages_id") REFERENCES "public"."private_messages"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_private_messages_id_idx" ON "payload_locked_documents_rels" USING btree ("private_messages_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "private_messages" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "private_messages" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_private_messages_fk";
  
  DROP INDEX "payload_locked_documents_rels_private_messages_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "private_messages_id";`)
}
