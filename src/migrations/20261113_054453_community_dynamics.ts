import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "community_dynamics_levels" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"level" varchar NOT NULL,
  	"count" numeric,
  	"share" numeric,
  	"threshold" numeric NOT NULL,
  	"scale" numeric
  );
  
  CREATE TABLE "community_dynamics" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"computed_at" timestamp(3) with time zone,
  	"total_active_members" numeric,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "community_dynamics_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "_community_dynamics_v_version_levels" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"level" varchar NOT NULL,
  	"count" numeric,
  	"share" numeric,
  	"threshold" numeric NOT NULL,
  	"scale" numeric,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_community_dynamics_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version_computed_at" timestamp(3) with time zone,
  	"version_total_active_members" numeric,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_community_dynamics_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  ALTER TABLE "links" ALTER COLUMN "feed" SET DEFAULT 'user';
  ALTER TABLE "_links_v" ALTER COLUMN "version_feed" SET DEFAULT 'user';
  ALTER TABLE "community_dynamics_levels" ADD CONSTRAINT "community_dynamics_levels_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."community_dynamics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "community_dynamics_rels" ADD CONSTRAINT "community_dynamics_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."community_dynamics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "community_dynamics_rels" ADD CONSTRAINT "community_dynamics_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_community_dynamics_v_version_levels" ADD CONSTRAINT "_community_dynamics_v_version_levels_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_community_dynamics_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_community_dynamics_v_rels" ADD CONSTRAINT "_community_dynamics_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_community_dynamics_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_community_dynamics_v_rels" ADD CONSTRAINT "_community_dynamics_v_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "community_dynamics_levels_order_idx" ON "community_dynamics_levels" USING btree ("_order");
  CREATE INDEX "community_dynamics_levels_parent_id_idx" ON "community_dynamics_levels" USING btree ("_parent_id");
  CREATE INDEX "community_dynamics_rels_order_idx" ON "community_dynamics_rels" USING btree ("order");
  CREATE INDEX "community_dynamics_rels_parent_idx" ON "community_dynamics_rels" USING btree ("parent_id");
  CREATE INDEX "community_dynamics_rels_path_idx" ON "community_dynamics_rels" USING btree ("path");
  CREATE INDEX "community_dynamics_rels_users_id_idx" ON "community_dynamics_rels" USING btree ("users_id");
  CREATE INDEX "_community_dynamics_v_version_levels_order_idx" ON "_community_dynamics_v_version_levels" USING btree ("_order");
  CREATE INDEX "_community_dynamics_v_version_levels_parent_id_idx" ON "_community_dynamics_v_version_levels" USING btree ("_parent_id");
  CREATE INDEX "_community_dynamics_v_created_at_idx" ON "_community_dynamics_v" USING btree ("created_at");
  CREATE INDEX "_community_dynamics_v_updated_at_idx" ON "_community_dynamics_v" USING btree ("updated_at");
  CREATE INDEX "_community_dynamics_v_rels_order_idx" ON "_community_dynamics_v_rels" USING btree ("order");
  CREATE INDEX "_community_dynamics_v_rels_parent_idx" ON "_community_dynamics_v_rels" USING btree ("parent_id");
  CREATE INDEX "_community_dynamics_v_rels_path_idx" ON "_community_dynamics_v_rels" USING btree ("path");
  CREATE INDEX "_community_dynamics_v_rels_users_id_idx" ON "_community_dynamics_v_rels" USING btree ("users_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "community_dynamics_levels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "community_dynamics" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "community_dynamics_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_community_dynamics_v_version_levels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_community_dynamics_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_community_dynamics_v_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "community_dynamics_levels" CASCADE;
  DROP TABLE "community_dynamics" CASCADE;
  DROP TABLE "community_dynamics_rels" CASCADE;
  DROP TABLE "_community_dynamics_v_version_levels" CASCADE;
  DROP TABLE "_community_dynamics_v" CASCADE;
  DROP TABLE "_community_dynamics_v_rels" CASCADE;
  ALTER TABLE "links" ALTER COLUMN "feed" SET DEFAULT 'main';
  ALTER TABLE "_links_v" ALTER COLUMN "version_feed" SET DEFAULT 'main';`)
}
