CREATE TABLE "lesson_library_items" (
	"lesson_id" uuid NOT NULL,
	"library_item_id" uuid NOT NULL,
	"attached_by" uuid NOT NULL,
	"attached_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_library_items_lesson_id_library_item_id_pk" PRIMARY KEY("lesson_id","library_item_id")
);
--> statement-breakpoint
CREATE TABLE "library_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"level" text,
	"description" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"attachment_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_items_attachment_id_unique" UNIQUE("attachment_id")
);
--> statement-breakpoint
ALTER TABLE "lesson_library_items" ADD CONSTRAINT "lesson_library_items_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_library_items" ADD CONSTRAINT "lesson_library_items_library_item_id_library_items_id_fk" FOREIGN KEY ("library_item_id") REFERENCES "public"."library_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_library_items" ADD CONSTRAINT "lesson_library_items_attached_by_users_id_fk" FOREIGN KEY ("attached_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_library_items_item_idx" ON "lesson_library_items" USING btree ("library_item_id");