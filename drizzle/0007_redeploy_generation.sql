DROP INDEX "deployments_open_commit";--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "generation" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "deployments_open_commit" ON "deployments" USING btree ("project_id","environment",coalesce("pr", 0),"sha","generation") WHERE status in ('queued', 'starting', 'live');--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_generation_range" CHECK ("deployments"."generation" between 1 and 9999);