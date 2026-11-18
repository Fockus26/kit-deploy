CREATE TABLE "alert_checks" (
	"key" text PRIMARY KEY NOT NULL,
	"failing" boolean NOT NULL,
	"streak" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"project" text,
	"title" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"resolved_notified_at" timestamp with time zone,
	CONSTRAINT "alerts_kind" CHECK (kind in ('site_down', 'cert_expiring', 'disk', 'memory', 'backup_failed', 'deploy_failed')),
	CONSTRAINT "alerts_key_format" CHECK ("alerts"."key" ~ '^[a-z_]+(:[A-Za-z0-9_.*-]{1,253})?$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_open_key" ON "alerts" USING btree ("key") WHERE resolved_at is null;--> statement-breakpoint
CREATE INDEX "alerts_opened" ON "alerts" USING btree ("opened_at" DESC NULLS LAST);