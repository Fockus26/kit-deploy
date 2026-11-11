CREATE TABLE "deploy_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "deploy_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "deploy_tokens_hash_format" CHECK ("deploy_tokens"."token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"environment" text NOT NULL,
	"pr" integer,
	"sha" text NOT NULL,
	"image" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"container" text,
	"port" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "deployments_sha_format" CHECK ("deployments"."sha" ~ '^[0-9a-f]{40}$'),
	CONSTRAINT "deployments_environment" CHECK ("deployments"."environment" in ('production', 'preview')),
	CONSTRAINT "deployments_status" CHECK (status in ('queued', 'starting', 'live', 'failed', 'superseded')),
	CONSTRAINT "deployments_pr_matches_env" CHECK (("deployments"."environment" = 'preview') = ("deployments"."pr" is not null))
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"repo" text NOT NULL,
	"production_branch" text DEFAULT 'main' NOT NULL,
	"memory_mb" integer DEFAULT 512 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_name_unique" UNIQUE("name"),
	CONSTRAINT "projects_repo_unique" UNIQUE("repo"),
	CONSTRAINT "projects_name_format" CHECK ("projects"."name" ~ '^[a-z0-9][a-z0-9_]{0,39}$'),
	CONSTRAINT "projects_repo_format" CHECK ("projects"."repo" ~ '^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}$'),
	CONSTRAINT "projects_memory_range" CHECK ("projects"."memory_mb" between 128 and 2048)
);
--> statement-breakpoint
ALTER TABLE "deploy_tokens" ADD CONSTRAINT "deploy_tokens_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deployments_project_created" ON "deployments" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "deployments_open_commit" ON "deployments" USING btree ("project_id","environment","sha") WHERE status in ('queued', 'starting', 'live');