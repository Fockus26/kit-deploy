CREATE TABLE "preview_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"host" text NOT NULL,
	"path" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preview_grants_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "preview_grants_hash_format" CHECK ("preview_grants"."token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "preview_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preview_sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "preview_sessions_hash_format" CHECK ("preview_sessions"."token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "preview_grants" ADD CONSTRAINT "preview_grants_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_sessions" ADD CONSTRAINT "preview_sessions_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "preview_grants_expires" ON "preview_grants" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "preview_sessions_user" ON "preview_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "preview_sessions_expires" ON "preview_sessions" USING btree ("expires_at");