CREATE TABLE "control_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"connection_id" uuid NOT NULL,
	"repository_id" bigint NOT NULL,
	"repository_name" text NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" bigint NOT NULL,
	"target_number" integer NOT NULL,
	"target_title" text NOT NULL,
	"target_url" text NOT NULL,
	"skill_path" text NOT NULL,
	"skill_sha" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "control_tasks_history_idx" ON "control_tasks" USING btree ("organization_id","created_at","id");