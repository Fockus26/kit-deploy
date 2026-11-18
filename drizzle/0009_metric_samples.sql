CREATE TABLE "metric_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"subject" text NOT NULL,
	"project" text,
	"environment" text,
	"resolution" text NOT NULL,
	"bucket" timestamp with time zone NOT NULL,
	"samples" integer DEFAULT 1 NOT NULL,
	"cpu_pct" double precision,
	"mem_bytes" bigint,
	"mem_limit_bytes" bigint,
	"disk_bytes" bigint,
	"disk_total_bytes" bigint,
	"load1" double precision,
	"cpus" integer,
	"requests" integer,
	"requests_5xx" integer,
	CONSTRAINT "metric_samples_scope" CHECK (scope in ('vps', 'container', 'requests')),
	CONSTRAINT "metric_samples_resolution" CHECK (resolution in ('1m', '1h')),
	CONSTRAINT "metric_samples_subject" CHECK (("metric_samples"."scope" = 'vps' and "metric_samples"."subject" = 'vps' and "metric_samples"."project" is null and "metric_samples"."environment" is null)
        or ("metric_samples"."scope" <> 'vps' and "metric_samples"."project" ~ '^[a-z0-9][a-z0-9_]{0,39}$' and "metric_samples"."environment" ~ '^(production|pr-[1-9][0-9]{0,5})$')),
	CONSTRAINT "metric_samples_requests_subject" CHECK ("metric_samples"."scope" <> 'requests' or "metric_samples"."subject" = "metric_samples"."project" || '/' || "metric_samples"."environment"),
	CONSTRAINT "metric_samples_samples" CHECK ("metric_samples"."samples" >= 1),
	CONSTRAINT "metric_samples_requests_range" CHECK ("metric_samples"."requests" is null or ("metric_samples"."requests" >= 0 and "metric_samples"."requests_5xx" between 0 and "metric_samples"."requests"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "metric_samples_slot" ON "metric_samples" USING btree ("scope","subject","resolution","bucket");--> statement-breakpoint
CREATE INDEX "metric_samples_project" ON "metric_samples" USING btree ("project","resolution","bucket");--> statement-breakpoint
CREATE INDEX "metric_samples_prune" ON "metric_samples" USING btree ("resolution","bucket");