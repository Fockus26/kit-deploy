ALTER TABLE "domains" ADD COLUMN "redirect" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "status" text DEFAULT 'pending_dns' NOT NULL;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "dns_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "dns_ok_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "cert_not_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_redirect" CHECK (redirect in ('none', 'to_apex', 'to_www'));--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_status" CHECK (status in ('pending_dns', 'issuing', 'ready', 'error'));--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_last_error_length" CHECK (char_length("domains"."last_error") <= 300);--> statement-breakpoint
-- Hand-written (D028): every host that exists now is already in its Caddy site, so it stays there
-- (dns_ok_at set) and the first `kit-deploy domain check` settles its certificate state.
UPDATE "domains" SET "status" = 'issuing', "dns_ok_at" = now();
