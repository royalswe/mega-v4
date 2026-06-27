import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_trust_level" AS ENUM('newcomer', 'regular', 'recognized', 'trusted', 'veteran', 'curator', 'pillar', 'legend');
  CREATE TYPE "public"."enum_links_feed" AS ENUM('main', 'user', 'subfeed');
  CREATE TYPE "public"."enum_links_moderation_status" AS ENUM('pending', 'approved', 'removed');
  CREATE TYPE "public"."enum__links_v_version_feed" AS ENUM('main', 'user', 'subfeed');
  CREATE TYPE "public"."enum__links_v_version_moderation_status" AS ENUM('pending', 'approved', 'removed');
  CREATE TYPE "public"."enum_posts_type" AS ENUM('link', 'article', 'image', 'video', 'discussion');
  CREATE TYPE "public"."enum_posts_feed" AS ENUM('main', 'user', 'subfeed');
  CREATE TYPE "public"."enum_posts_status" AS ENUM('published', 'pending', 'removed');
  CREATE TYPE "public"."enum_comments_moderation_status" AS ENUM('visible', 'pending', 'removed');
  CREATE TYPE "public"."enum_reports_target_type" AS ENUM('post', 'comment', 'link', 'user');
  CREATE TYPE "public"."enum_reports_reason" AS ENUM('spam', 'abuse', 'broken_link', 'harassment', 'nsfw', 'other');
  CREATE TYPE "public"."enum_reports_status" AS ENUM('pending', 'approved', 'rejected');
  ALTER TYPE "public"."enum_users_roles" ADD VALUE 'editor' BEFORE 'user';
  ALTER TYPE "public"."enum_users_roles" ADD VALUE 'moderator' BEFORE 'user';
  ALTER TYPE "public"."enum_users_roles" ADD VALUE 'uploader' BEFORE 'user';
  CREATE TABLE "users_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "links_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "_links_v_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "posts_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "subfeeds" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar NOT NULL,
  	"avatar_id" integer,
  	"banner_id" integer,
  	"rules" varchar,
  	"theme" varchar,
  	"reputation" numeric DEFAULT 0,
  	"featured" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "subfeeds_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "discoveries" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"post_id" integer NOT NULL,
  	"discovered_at" timestamp(3) with time zone NOT NULL,
  	"engagement_generated" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "reports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"reporter_id" integer NOT NULL,
  	"target_type" "enum_reports_target_type" NOT NULL,
  	"target_id" varchar NOT NULL,
  	"target_post_id" integer,
  	"target_comment_id" integer,
  	"target_link_id" integer,
  	"target_user_id" integer,
  	"reason" "enum_reports_reason" DEFAULT 'spam' NOT NULL,
  	"details" varchar,
  	"status" "enum_reports_status" DEFAULT 'pending' NOT NULL,
  	"reviewed_by_id" integer,
  	"fast_tracked" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "posts" ALTER COLUMN "nsfw" SET DEFAULT false;
  ALTER TABLE "users" ADD COLUMN "bio" varchar;
  ALTER TABLE "users" ADD COLUMN "trust_level" "enum_users_trust_level" DEFAULT 'newcomer';
  ALTER TABLE "users" ADD COLUMN "reputation_hidden" numeric DEFAULT 0;
  ALTER TABLE "users" ADD COLUMN "reputation_public_label" varchar DEFAULT 'Newcomer';
  ALTER TABLE "users" ADD COLUMN "security_score" numeric DEFAULT 0;
  ALTER TABLE "users" ADD COLUMN "is_uploader" boolean DEFAULT false;
  ALTER TABLE "users" ADD COLUMN "is_editor" boolean DEFAULT false;
  ALTER TABLE "users" ADD COLUMN "is_moderator" boolean DEFAULT false;
  ALTER TABLE "users" ADD COLUMN "is_admin" boolean DEFAULT false;
  ALTER TABLE "users" ADD COLUMN "streak_days" numeric DEFAULT 0;
  ALTER TABLE "users" ADD COLUMN "last_active_at" timestamp(3) with time zone;
  ALTER TABLE "users" ADD COLUMN "discovery_score" numeric DEFAULT 0;
  ALTER TABLE "users" ADD COLUMN "contribution_score" numeric DEFAULT 0;
  ALTER TABLE "users" ADD COLUMN "interaction_score" numeric DEFAULT 0;
  ALTER TABLE "users" ADD COLUMN "moderation_score" numeric DEFAULT 0;
  ALTER TABLE "users" ADD COLUMN "legacy_contribution_score" numeric DEFAULT 0;
  ALTER TABLE "links" ADD COLUMN "slug" varchar;
  ALTER TABLE "links" ADD COLUMN "feed" "enum_links_feed" DEFAULT 'main';
  ALTER TABLE "links" ADD COLUMN "subfeed_id" integer;
  ALTER TABLE "links" ADD COLUMN "score" numeric DEFAULT 0;
  ALTER TABLE "links" ADD COLUMN "ranking_score" numeric DEFAULT 0;
  ALTER TABLE "links" ADD COLUMN "controversy_score" numeric DEFAULT 0;
  ALTER TABLE "links" ADD COLUMN "discovery_momentum" numeric DEFAULT 0;
  ALTER TABLE "links" ADD COLUMN "engagement_velocity" numeric DEFAULT 0;
  ALTER TABLE "links" ADD COLUMN "upvotes" numeric DEFAULT 0;
  ALTER TABLE "links" ADD COLUMN "downvotes" numeric DEFAULT 0;
  ALTER TABLE "links" ADD COLUMN "comments_count" numeric DEFAULT 0;
  ALTER TABLE "links" ADD COLUMN "shares_count" numeric DEFAULT 0;
  ALTER TABLE "links" ADD COLUMN "unique_commenters" numeric DEFAULT 0;
  ALTER TABLE "links" ADD COLUMN "trusted_interactions" numeric DEFAULT 0;
  ALTER TABLE "links" ADD COLUMN "spam_probability" numeric DEFAULT 0;
  ALTER TABLE "links" ADD COLUMN "ragebait_probability" numeric DEFAULT 0;
  ALTER TABLE "links" ADD COLUMN "featured" boolean DEFAULT false;
  ALTER TABLE "links" ADD COLUMN "breaking" boolean DEFAULT false;
  ALTER TABLE "links" ADD COLUMN "controversial" boolean DEFAULT false;
  ALTER TABLE "links" ADD COLUMN "moderation_status" "enum_links_moderation_status" DEFAULT 'pending';
  ALTER TABLE "_links_v" ADD COLUMN "version_slug" varchar;
  ALTER TABLE "_links_v" ADD COLUMN "version_feed" "enum__links_v_version_feed" DEFAULT 'main';
  ALTER TABLE "_links_v" ADD COLUMN "version_subfeed_id" integer;
  ALTER TABLE "_links_v" ADD COLUMN "version_score" numeric DEFAULT 0;
  ALTER TABLE "_links_v" ADD COLUMN "version_ranking_score" numeric DEFAULT 0;
  ALTER TABLE "_links_v" ADD COLUMN "version_controversy_score" numeric DEFAULT 0;
  ALTER TABLE "_links_v" ADD COLUMN "version_discovery_momentum" numeric DEFAULT 0;
  ALTER TABLE "_links_v" ADD COLUMN "version_engagement_velocity" numeric DEFAULT 0;
  ALTER TABLE "_links_v" ADD COLUMN "version_upvotes" numeric DEFAULT 0;
  ALTER TABLE "_links_v" ADD COLUMN "version_downvotes" numeric DEFAULT 0;
  ALTER TABLE "_links_v" ADD COLUMN "version_comments_count" numeric DEFAULT 0;
  ALTER TABLE "_links_v" ADD COLUMN "version_shares_count" numeric DEFAULT 0;
  ALTER TABLE "_links_v" ADD COLUMN "version_unique_commenters" numeric DEFAULT 0;
  ALTER TABLE "_links_v" ADD COLUMN "version_trusted_interactions" numeric DEFAULT 0;
  ALTER TABLE "_links_v" ADD COLUMN "version_spam_probability" numeric DEFAULT 0;
  ALTER TABLE "_links_v" ADD COLUMN "version_ragebait_probability" numeric DEFAULT 0;
  ALTER TABLE "_links_v" ADD COLUMN "version_featured" boolean DEFAULT false;
  ALTER TABLE "_links_v" ADD COLUMN "version_breaking" boolean DEFAULT false;
  ALTER TABLE "_links_v" ADD COLUMN "version_controversial" boolean DEFAULT false;
  ALTER TABLE "_links_v" ADD COLUMN "version_moderation_status" "enum__links_v_version_moderation_status" DEFAULT 'pending';
  ALTER TABLE "posts" ADD COLUMN "slug" varchar;
  ALTER TABLE "posts" ADD COLUMN "type" "enum_posts_type" DEFAULT 'discussion' NOT NULL;
  ALTER TABLE "posts" ADD COLUMN "feed" "enum_posts_feed" DEFAULT 'user' NOT NULL;
  ALTER TABLE "posts" ADD COLUMN "subfeed_id" integer;
  ALTER TABLE "posts" ADD COLUMN "score" numeric DEFAULT 0;
  ALTER TABLE "posts" ADD COLUMN "ranking_score" numeric DEFAULT 0;
  ALTER TABLE "posts" ADD COLUMN "controversy_score" numeric DEFAULT 0;
  ALTER TABLE "posts" ADD COLUMN "discovery_momentum" numeric DEFAULT 0;
  ALTER TABLE "posts" ADD COLUMN "engagement_velocity" numeric DEFAULT 0;
  ALTER TABLE "posts" ADD COLUMN "upvotes" numeric DEFAULT 0;
  ALTER TABLE "posts" ADD COLUMN "downvotes" numeric DEFAULT 0;
  ALTER TABLE "posts" ADD COLUMN "comments_count" numeric DEFAULT 0;
  ALTER TABLE "posts" ADD COLUMN "shares_count" numeric DEFAULT 0;
  ALTER TABLE "posts" ADD COLUMN "unique_commenters" numeric DEFAULT 0;
  ALTER TABLE "posts" ADD COLUMN "trusted_interactions" numeric DEFAULT 0;
  ALTER TABLE "posts" ADD COLUMN "spam_probability" numeric DEFAULT 0;
  ALTER TABLE "posts" ADD COLUMN "ragebait_probability" numeric DEFAULT 0;
  ALTER TABLE "posts" ADD COLUMN "featured" boolean DEFAULT false;
  ALTER TABLE "posts" ADD COLUMN "breaking" boolean DEFAULT false;
  ALTER TABLE "posts" ADD COLUMN "controversial" boolean DEFAULT false;
  ALTER TABLE "posts" ADD COLUMN "status" "enum_posts_status" DEFAULT 'pending';
  ALTER TABLE "comments" ADD COLUMN "parent_comment_id" integer;
  ALTER TABLE "comments" ADD COLUMN "upvotes" numeric DEFAULT 0;
  ALTER TABLE "comments" ADD COLUMN "downvotes" numeric DEFAULT 0;
  ALTER TABLE "comments" ADD COLUMN "score" numeric DEFAULT 0;
  ALTER TABLE "comments" ADD COLUMN "controversy_score" numeric DEFAULT 0;
  ALTER TABLE "comments" ADD COLUMN "moderation_status" "enum_comments_moderation_status" DEFAULT 'visible';
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "subfeeds_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "discoveries_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "reports_id" integer;
  ALTER TABLE "users_texts" ADD CONSTRAINT "users_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "links_texts" ADD CONSTRAINT "links_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."links"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_links_v_texts" ADD CONSTRAINT "_links_v_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_links_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_texts" ADD CONSTRAINT "posts_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "subfeeds" ADD CONSTRAINT "subfeeds_avatar_id_media_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "subfeeds" ADD CONSTRAINT "subfeeds_banner_id_media_id_fk" FOREIGN KEY ("banner_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "subfeeds_rels" ADD CONSTRAINT "subfeeds_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."subfeeds"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "subfeeds_rels" ADD CONSTRAINT "subfeeds_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "discoveries" ADD CONSTRAINT "discoveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discoveries" ADD CONSTRAINT "discoveries_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reports" ADD CONSTRAINT "reports_target_post_id_posts_id_fk" FOREIGN KEY ("target_post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reports" ADD CONSTRAINT "reports_target_comment_id_comments_id_fk" FOREIGN KEY ("target_comment_id") REFERENCES "public"."comments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reports" ADD CONSTRAINT "reports_target_link_id_links_id_fk" FOREIGN KEY ("target_link_id") REFERENCES "public"."links"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reports" ADD CONSTRAINT "reports_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reports" ADD CONSTRAINT "reports_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "users_texts_order_parent" ON "users_texts" USING btree ("order","parent_id");
  CREATE INDEX "links_texts_order_parent" ON "links_texts" USING btree ("order","parent_id");
  CREATE INDEX "_links_v_texts_order_parent" ON "_links_v_texts" USING btree ("order","parent_id");
  CREATE INDEX "posts_texts_order_parent" ON "posts_texts" USING btree ("order","parent_id");
  CREATE UNIQUE INDEX "subfeeds_name_idx" ON "subfeeds" USING btree ("name");
  CREATE UNIQUE INDEX "subfeeds_slug_idx" ON "subfeeds" USING btree ("slug");
  CREATE INDEX "subfeeds_avatar_idx" ON "subfeeds" USING btree ("avatar_id");
  CREATE INDEX "subfeeds_banner_idx" ON "subfeeds" USING btree ("banner_id");
  CREATE INDEX "subfeeds_updated_at_idx" ON "subfeeds" USING btree ("updated_at");
  CREATE INDEX "subfeeds_created_at_idx" ON "subfeeds" USING btree ("created_at");
  CREATE INDEX "subfeeds_rels_order_idx" ON "subfeeds_rels" USING btree ("order");
  CREATE INDEX "subfeeds_rels_parent_idx" ON "subfeeds_rels" USING btree ("parent_id");
  CREATE INDEX "subfeeds_rels_path_idx" ON "subfeeds_rels" USING btree ("path");
  CREATE INDEX "subfeeds_rels_users_id_idx" ON "subfeeds_rels" USING btree ("users_id");
  CREATE INDEX "discoveries_user_idx" ON "discoveries" USING btree ("user_id");
  CREATE INDEX "discoveries_post_idx" ON "discoveries" USING btree ("post_id");
  CREATE INDEX "discoveries_engagement_generated_idx" ON "discoveries" USING btree ("engagement_generated");
  CREATE INDEX "discoveries_updated_at_idx" ON "discoveries" USING btree ("updated_at");
  CREATE INDEX "discoveries_created_at_idx" ON "discoveries" USING btree ("created_at");
  CREATE INDEX "reports_reporter_idx" ON "reports" USING btree ("reporter_id");
  CREATE INDEX "reports_target_id_idx" ON "reports" USING btree ("target_id");
  CREATE INDEX "reports_target_post_idx" ON "reports" USING btree ("target_post_id");
  CREATE INDEX "reports_target_comment_idx" ON "reports" USING btree ("target_comment_id");
  CREATE INDEX "reports_target_link_idx" ON "reports" USING btree ("target_link_id");
  CREATE INDEX "reports_target_user_idx" ON "reports" USING btree ("target_user_id");
  CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");
  CREATE INDEX "reports_reviewed_by_idx" ON "reports" USING btree ("reviewed_by_id");
  CREATE INDEX "reports_updated_at_idx" ON "reports" USING btree ("updated_at");
  CREATE INDEX "reports_created_at_idx" ON "reports" USING btree ("created_at");
  ALTER TABLE "links" ADD CONSTRAINT "links_subfeed_id_subfeeds_id_fk" FOREIGN KEY ("subfeed_id") REFERENCES "public"."subfeeds"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_links_v" ADD CONSTRAINT "_links_v_version_subfeed_id_subfeeds_id_fk" FOREIGN KEY ("version_subfeed_id") REFERENCES "public"."subfeeds"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_subfeed_id_subfeeds_id_fk" FOREIGN KEY ("subfeed_id") REFERENCES "public"."subfeeds"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_comment_id_comments_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."comments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_subfeeds_fk" FOREIGN KEY ("subfeeds_id") REFERENCES "public"."subfeeds"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_discoveries_fk" FOREIGN KEY ("discoveries_id") REFERENCES "public"."discoveries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_reports_fk" FOREIGN KEY ("reports_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "links_slug_idx" ON "links" USING btree ("slug");
  CREATE INDEX "links_subfeed_idx" ON "links" USING btree ("subfeed_id");
  CREATE INDEX "links_ranking_score_idx" ON "links" USING btree ("ranking_score");
  CREATE INDEX "links_moderation_status_idx" ON "links" USING btree ("moderation_status");
  CREATE INDEX "_links_v_version_version_slug_idx" ON "_links_v" USING btree ("version_slug");
  CREATE INDEX "_links_v_version_version_subfeed_idx" ON "_links_v" USING btree ("version_subfeed_id");
  CREATE INDEX "_links_v_version_version_ranking_score_idx" ON "_links_v" USING btree ("version_ranking_score");
  CREATE INDEX "_links_v_version_version_moderation_status_idx" ON "_links_v" USING btree ("version_moderation_status");
  CREATE UNIQUE INDEX "posts_slug_idx" ON "posts" USING btree ("slug");
  CREATE INDEX "posts_subfeed_idx" ON "posts" USING btree ("subfeed_id");
  CREATE INDEX "posts_ranking_score_idx" ON "posts" USING btree ("ranking_score");
  CREATE INDEX "posts_status_idx" ON "posts" USING btree ("status");
  CREATE INDEX "comments_parent_comment_idx" ON "comments" USING btree ("parent_comment_id");
  CREATE INDEX "comments_moderation_status_idx" ON "comments" USING btree ("moderation_status");
  CREATE INDEX "payload_locked_documents_rels_subfeeds_id_idx" ON "payload_locked_documents_rels" USING btree ("subfeeds_id");
  CREATE INDEX "payload_locked_documents_rels_discoveries_id_idx" ON "payload_locked_documents_rels" USING btree ("discoveries_id");
  CREATE INDEX "payload_locked_documents_rels_reports_id_idx" ON "payload_locked_documents_rels" USING btree ("reports_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "links_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_links_v_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "subfeeds" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "subfeeds_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "discoveries" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "reports" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "users_texts" CASCADE;
  DROP TABLE "links_texts" CASCADE;
  DROP TABLE "_links_v_texts" CASCADE;
  DROP TABLE "posts_texts" CASCADE;
  DROP TABLE "subfeeds" CASCADE;
  DROP TABLE "subfeeds_rels" CASCADE;
  DROP TABLE "discoveries" CASCADE;
  DROP TABLE "reports" CASCADE;
  ALTER TABLE "links" DROP CONSTRAINT "links_subfeed_id_subfeeds_id_fk";
  
  ALTER TABLE "_links_v" DROP CONSTRAINT "_links_v_version_subfeed_id_subfeeds_id_fk";
  
  ALTER TABLE "posts" DROP CONSTRAINT "posts_subfeed_id_subfeeds_id_fk";
  
  ALTER TABLE "comments" DROP CONSTRAINT "comments_parent_comment_id_comments_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_subfeeds_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_discoveries_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_reports_fk";
  
  ALTER TABLE "users_roles" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_users_roles";
  CREATE TYPE "public"."enum_users_roles" AS ENUM('admin', 'user');
  ALTER TABLE "users_roles" ALTER COLUMN "value" SET DATA TYPE "public"."enum_users_roles" USING "value"::"public"."enum_users_roles";
  DROP INDEX "links_slug_idx";
  DROP INDEX "links_subfeed_idx";
  DROP INDEX "links_ranking_score_idx";
  DROP INDEX "links_moderation_status_idx";
  DROP INDEX "_links_v_version_version_slug_idx";
  DROP INDEX "_links_v_version_version_subfeed_idx";
  DROP INDEX "_links_v_version_version_ranking_score_idx";
  DROP INDEX "_links_v_version_version_moderation_status_idx";
  DROP INDEX "posts_slug_idx";
  DROP INDEX "posts_subfeed_idx";
  DROP INDEX "posts_ranking_score_idx";
  DROP INDEX "posts_status_idx";
  DROP INDEX "comments_parent_comment_idx";
  DROP INDEX "comments_moderation_status_idx";
  DROP INDEX "payload_locked_documents_rels_subfeeds_id_idx";
  DROP INDEX "payload_locked_documents_rels_discoveries_id_idx";
  DROP INDEX "payload_locked_documents_rels_reports_id_idx";
  ALTER TABLE "posts" ALTER COLUMN "nsfw" DROP DEFAULT;
  ALTER TABLE "users" DROP COLUMN "bio";
  ALTER TABLE "users" DROP COLUMN "trust_level";
  ALTER TABLE "users" DROP COLUMN "reputation_hidden";
  ALTER TABLE "users" DROP COLUMN "reputation_public_label";
  ALTER TABLE "users" DROP COLUMN "security_score";
  ALTER TABLE "users" DROP COLUMN "is_uploader";
  ALTER TABLE "users" DROP COLUMN "is_editor";
  ALTER TABLE "users" DROP COLUMN "is_moderator";
  ALTER TABLE "users" DROP COLUMN "is_admin";
  ALTER TABLE "users" DROP COLUMN "streak_days";
  ALTER TABLE "users" DROP COLUMN "last_active_at";
  ALTER TABLE "users" DROP COLUMN "discovery_score";
  ALTER TABLE "users" DROP COLUMN "contribution_score";
  ALTER TABLE "users" DROP COLUMN "interaction_score";
  ALTER TABLE "users" DROP COLUMN "moderation_score";
  ALTER TABLE "users" DROP COLUMN "legacy_contribution_score";
  ALTER TABLE "links" DROP COLUMN "slug";
  ALTER TABLE "links" DROP COLUMN "feed";
  ALTER TABLE "links" DROP COLUMN "subfeed_id";
  ALTER TABLE "links" DROP COLUMN "score";
  ALTER TABLE "links" DROP COLUMN "ranking_score";
  ALTER TABLE "links" DROP COLUMN "controversy_score";
  ALTER TABLE "links" DROP COLUMN "discovery_momentum";
  ALTER TABLE "links" DROP COLUMN "engagement_velocity";
  ALTER TABLE "links" DROP COLUMN "upvotes";
  ALTER TABLE "links" DROP COLUMN "downvotes";
  ALTER TABLE "links" DROP COLUMN "comments_count";
  ALTER TABLE "links" DROP COLUMN "shares_count";
  ALTER TABLE "links" DROP COLUMN "unique_commenters";
  ALTER TABLE "links" DROP COLUMN "trusted_interactions";
  ALTER TABLE "links" DROP COLUMN "spam_probability";
  ALTER TABLE "links" DROP COLUMN "ragebait_probability";
  ALTER TABLE "links" DROP COLUMN "featured";
  ALTER TABLE "links" DROP COLUMN "breaking";
  ALTER TABLE "links" DROP COLUMN "controversial";
  ALTER TABLE "links" DROP COLUMN "moderation_status";
  ALTER TABLE "_links_v" DROP COLUMN "version_slug";
  ALTER TABLE "_links_v" DROP COLUMN "version_feed";
  ALTER TABLE "_links_v" DROP COLUMN "version_subfeed_id";
  ALTER TABLE "_links_v" DROP COLUMN "version_score";
  ALTER TABLE "_links_v" DROP COLUMN "version_ranking_score";
  ALTER TABLE "_links_v" DROP COLUMN "version_controversy_score";
  ALTER TABLE "_links_v" DROP COLUMN "version_discovery_momentum";
  ALTER TABLE "_links_v" DROP COLUMN "version_engagement_velocity";
  ALTER TABLE "_links_v" DROP COLUMN "version_upvotes";
  ALTER TABLE "_links_v" DROP COLUMN "version_downvotes";
  ALTER TABLE "_links_v" DROP COLUMN "version_comments_count";
  ALTER TABLE "_links_v" DROP COLUMN "version_shares_count";
  ALTER TABLE "_links_v" DROP COLUMN "version_unique_commenters";
  ALTER TABLE "_links_v" DROP COLUMN "version_trusted_interactions";
  ALTER TABLE "_links_v" DROP COLUMN "version_spam_probability";
  ALTER TABLE "_links_v" DROP COLUMN "version_ragebait_probability";
  ALTER TABLE "_links_v" DROP COLUMN "version_featured";
  ALTER TABLE "_links_v" DROP COLUMN "version_breaking";
  ALTER TABLE "_links_v" DROP COLUMN "version_controversial";
  ALTER TABLE "_links_v" DROP COLUMN "version_moderation_status";
  ALTER TABLE "posts" DROP COLUMN "slug";
  ALTER TABLE "posts" DROP COLUMN "type";
  ALTER TABLE "posts" DROP COLUMN "feed";
  ALTER TABLE "posts" DROP COLUMN "subfeed_id";
  ALTER TABLE "posts" DROP COLUMN "score";
  ALTER TABLE "posts" DROP COLUMN "ranking_score";
  ALTER TABLE "posts" DROP COLUMN "controversy_score";
  ALTER TABLE "posts" DROP COLUMN "discovery_momentum";
  ALTER TABLE "posts" DROP COLUMN "engagement_velocity";
  ALTER TABLE "posts" DROP COLUMN "upvotes";
  ALTER TABLE "posts" DROP COLUMN "downvotes";
  ALTER TABLE "posts" DROP COLUMN "comments_count";
  ALTER TABLE "posts" DROP COLUMN "shares_count";
  ALTER TABLE "posts" DROP COLUMN "unique_commenters";
  ALTER TABLE "posts" DROP COLUMN "trusted_interactions";
  ALTER TABLE "posts" DROP COLUMN "spam_probability";
  ALTER TABLE "posts" DROP COLUMN "ragebait_probability";
  ALTER TABLE "posts" DROP COLUMN "featured";
  ALTER TABLE "posts" DROP COLUMN "breaking";
  ALTER TABLE "posts" DROP COLUMN "controversial";
  ALTER TABLE "posts" DROP COLUMN "status";
  ALTER TABLE "comments" DROP COLUMN "parent_comment_id";
  ALTER TABLE "comments" DROP COLUMN "upvotes";
  ALTER TABLE "comments" DROP COLUMN "downvotes";
  ALTER TABLE "comments" DROP COLUMN "score";
  ALTER TABLE "comments" DROP COLUMN "controversy_score";
  ALTER TABLE "comments" DROP COLUMN "moderation_status";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "subfeeds_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "discoveries_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "reports_id";
  DROP TYPE "public"."enum_users_trust_level";
  DROP TYPE "public"."enum_links_feed";
  DROP TYPE "public"."enum_links_moderation_status";
  DROP TYPE "public"."enum__links_v_version_feed";
  DROP TYPE "public"."enum__links_v_version_moderation_status";
  DROP TYPE "public"."enum_posts_type";
  DROP TYPE "public"."enum_posts_feed";
  DROP TYPE "public"."enum_posts_status";
  DROP TYPE "public"."enum_comments_moderation_status";
  DROP TYPE "public"."enum_reports_target_type";
  DROP TYPE "public"."enum_reports_reason";
  DROP TYPE "public"."enum_reports_status";`)
}
