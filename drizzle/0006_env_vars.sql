CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"project" text NOT NULL,
	"environment" text,
	"name" text,
	CONSTRAINT "audit_log_action" CHECK (action in ('env.set', 'env.remove')),
	CONSTRAINT "audit_log_environment" CHECK ("audit_log"."environment" is null or environment in ('production', 'preview', 'development')),
	CONSTRAINT "audit_log_actor_format" CHECK ("audit_log"."actor" ~ '^(ssh|web):[A-Za-z0-9_.@-]{1,64}$')
);
--> statement-breakpoint
CREATE TABLE "env_vars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"environment" text NOT NULL,
	"name" text NOT NULL,
	"secret" boolean NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"tag" text NOT NULL,
	"key_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "env_vars_environment" CHECK (environment in ('production', 'preview', 'development')),
	CONSTRAINT "env_vars_name_format" CHECK ("env_vars"."name" ~ '^[A-Z_][A-Z0-9_]{0,127}$'),
	CONSTRAINT "env_vars_name_settable" CHECK (not name in ('PORT', 'HOSTNAME', 'NODE_OPTIONS', 'DATABASE_URL', 'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY')),
	CONSTRAINT "env_vars_public_not_secret" CHECK (not ("env_vars"."secret" and "env_vars"."name" like 'NEXT\_PUBLIC\_%')),
	CONSTRAINT "env_vars_iv_format" CHECK ("env_vars"."iv" ~ '^[A-Za-z0-9+/]{16}$'),
	CONSTRAINT "env_vars_tag_format" CHECK ("env_vars"."tag" ~ '^[A-Za-z0-9+/]{22}==$'),
	CONSTRAINT "env_vars_ciphertext_format" CHECK ("env_vars"."ciphertext" ~ '^[A-Za-z0-9+/]+={0,2}$' and length("env_vars"."ciphertext") <= 43692),
	CONSTRAINT "env_vars_key_version" CHECK ("env_vars"."key_version" >= 1),
	CONSTRAINT "env_vars_updated_by_format" CHECK ("env_vars"."updated_by" ~ '^(ssh|web):[A-Za-z0-9_.@-]{1,64}$')
);
--> statement-breakpoint
ALTER TABLE "env_vars" ADD CONSTRAINT "env_vars_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_project_at" ON "audit_log" USING btree ("project","at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "env_vars_slot" ON "env_vars" USING btree ("project_id","environment","name");