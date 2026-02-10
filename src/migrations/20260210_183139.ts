import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "posts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"content" jsonb NOT NULL,
  	"nsfw" boolean,
  	"user_id" integer NOT NULL,
  	"votes" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "comments" ALTER COLUMN "comment" SET DATA TYPE jsonb;
  ALTER TABLE "comments" ALTER COLUMN "link_id" DROP NOT NULL;
  ALTER TABLE "votes" ALTER COLUMN "link_id" DROP NOT NULL;
  ALTER TABLE "bookmarks" ALTER COLUMN "link_id" DROP NOT NULL;
  ALTER TABLE "links" ADD COLUMN "click_count" numeric DEFAULT 0;
  ALTER TABLE "_links_v" ADD COLUMN "version_click_count" numeric DEFAULT 0;
  ALTER TABLE "comments" ADD COLUMN "post_id" integer;
  ALTER TABLE "votes" ADD COLUMN "post_id" integer;
  ALTER TABLE "bookmarks" ADD COLUMN "post_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "posts_id" integer;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "posts_user_idx" ON "posts" USING btree ("user_id");
  CREATE INDEX "posts_updated_at_idx" ON "posts" USING btree ("updated_at");
  CREATE INDEX "posts_created_at_idx" ON "posts" USING btree ("created_at");
  ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "votes" ADD CONSTRAINT "votes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "comments_post_idx" ON "comments" USING btree ("post_id");
  CREATE INDEX "votes_post_idx" ON "votes" USING btree ("post_id");
  CREATE INDEX "bookmarks_post_idx" ON "bookmarks" USING btree ("post_id");
  CREATE INDEX "payload_locked_documents_rels_posts_id_idx" ON "payload_locked_documents_rels" USING btree ("posts_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "posts" CASCADE;
  ALTER TABLE "comments" DROP CONSTRAINT "comments_post_id_posts_id_fk";
  
  ALTER TABLE "votes" DROP CONSTRAINT "votes_post_id_posts_id_fk";
  
  ALTER TABLE "bookmarks" DROP CONSTRAINT "bookmarks_post_id_posts_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_posts_fk";
  
  DROP INDEX "comments_post_idx";
  DROP INDEX "votes_post_idx";
  DROP INDEX "bookmarks_post_idx";
  DROP INDEX "payload_locked_documents_rels_posts_id_idx";
  ALTER TABLE "comments" ALTER COLUMN "comment" SET DATA TYPE varchar;
  ALTER TABLE "comments" ALTER COLUMN "link_id" SET NOT NULL;
  ALTER TABLE "votes" ALTER COLUMN "link_id" SET NOT NULL;
  ALTER TABLE "bookmarks" ALTER COLUMN "link_id" SET NOT NULL;
  ALTER TABLE "links" DROP COLUMN "click_count";
  ALTER TABLE "_links_v" DROP COLUMN "version_click_count";
  ALTER TABLE "comments" DROP COLUMN "post_id";
  ALTER TABLE "votes" DROP COLUMN "post_id";
  ALTER TABLE "bookmarks" DROP COLUMN "post_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "posts_id";`)
}
