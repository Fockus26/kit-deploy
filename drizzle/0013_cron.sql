CREATE TABLE "cron_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"path" text NOT NULL,
	"schedule" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cron_jobs_path_format" CHECK ("cron_jobs"."path" ~ '^/[A-Za-z0-9._~/-]{0,200}$' and strpos("cron_jobs"."path", '..') = 0),
	CONSTRAINT "cron_jobs_schedule_length" CHECK (length("cron_jobs"."schedule") between 9 and 100)
);
--> statement-breakpoint
CREATE TABLE "cron_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"http_status" integer,
	"duration_ms" integer,
	"error" text,
	CONSTRAINT "cron_runs_status" CHECK (status in ('running', 'ok', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_action";--> statement-breakpoint
ALTER TABLE "cron_jobs" ADD CONSTRAINT "cron_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cron_runs" ADD CONSTRAINT "cron_runs_job_id_cron_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."cron_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cron_jobs_route" ON "cron_jobs" USING btree ("project_id","path","schedule");--> statement-breakpoint
CREATE UNIQUE INDEX "cron_runs_slot" ON "cron_runs" USING btree ("job_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "cron_runs_job_started" ON "cron_runs" USING btree ("job_id","started_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_action" CHECK (action in ('env.set', 'env.remove', 'project.add', 'token.create', 'token.revoke', 'domain.add', 'domain.remove', 'project.redeploy', 'project.rollback', 'project.stop', 'project.restart', 'cron.add', 'cron.remove', 'cron.enable', 'cron.disable'));