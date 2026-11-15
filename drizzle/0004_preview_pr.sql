DROP INDEX "deployments_open_commit";--> statement-breakpoint
CREATE UNIQUE INDEX "deployments_open_commit" ON "deployments" USING btree ("project_id","environment",coalesce("pr", 0),"sha") WHERE status in ('queued', 'starting', 'live');--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_pr_range" CHECK ("deployments"."pr" between 1 and 999999);