CREATE TABLE "control_runners" (
	"organization_id" integer PRIMARY KEY NOT NULL,
	"instance_id" uuid NOT NULL,
	"readiness" text NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "control_tasks" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "control_tasks" ADD COLUMN "effort" text;--> statement-breakpoint
ALTER TABLE "control_tasks" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "control_tasks" ADD COLUMN "finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "control_tasks" ADD COLUMN "failure" text;--> statement-breakpoint
ALTER TABLE "control_tasks" ADD COLUMN "lease_id" uuid;--> statement-breakpoint
ALTER TABLE "control_tasks" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "control_tasks_queue_idx" ON "control_tasks" USING btree ("organization_id","repository_id","created_at","id") WHERE "control_tasks"."status" = 'queued';