CREATE TABLE "notification_state" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"muted_categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"read_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_state" ADD CONSTRAINT "notification_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
