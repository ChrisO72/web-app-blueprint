CREATE TABLE "github_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot" integer DEFAULT 1 NOT NULL,
	"login" text NOT NULL,
	"repository_id" bigint,
	"owner" text,
	"name" text,
	"url" text,
	"encrypted_token" text NOT NULL,
	"encrypted_webhook_secret" text,
	"webhook_id" bigint,
	"webhook_url" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"sync_id" uuid,
	"sync_cursor" jsonb,
	"last_synced_at" timestamp with time zone,
	"last_webhook_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_connections_slot_unique" UNIQUE("slot"),
	CONSTRAINT "github_single_connection" CHECK (slot = 1)
);
--> statement-breakpoint
CREATE TABLE "github_issues" (
	"connection_id" uuid NOT NULL,
	"github_id" bigint NOT NULL,
	"url" text NOT NULL,
	"github_created_at" timestamp with time zone NOT NULL,
	"github_updated_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unavailable_at" timestamp with time zone,
	"raw" jsonb NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"state" text NOT NULL,
	"state_reason" text,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"author" jsonb,
	"assignees" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "github_issues_connection_id_github_id_pk" PRIMARY KEY("connection_id","github_id")
);
--> statement-breakpoint
CREATE TABLE "github_pulls" (
	"connection_id" uuid NOT NULL,
	"github_id" bigint NOT NULL,
	"url" text NOT NULL,
	"github_created_at" timestamp with time zone NOT NULL,
	"github_updated_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unavailable_at" timestamp with time zone,
	"raw" jsonb NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"state" text NOT NULL,
	"state_reason" text,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"author" jsonb,
	"assignees" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"closed_at" timestamp with time zone,
	"draft" boolean DEFAULT false NOT NULL,
	"merged_at" timestamp with time zone,
	"head_branch" text NOT NULL,
	"base_branch" text NOT NULL,
	CONSTRAINT "github_pulls_connection_id_github_id_pk" PRIMARY KEY("connection_id","github_id")
);
--> statement-breakpoint
CREATE TABLE "github_runs" (
	"connection_id" uuid NOT NULL,
	"github_id" bigint NOT NULL,
	"url" text NOT NULL,
	"github_created_at" timestamp with time zone NOT NULL,
	"github_updated_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unavailable_at" timestamp with time zone,
	"raw" jsonb NOT NULL,
	"run_number" integer NOT NULL,
	"run_attempt" integer NOT NULL,
	"workflow_id" bigint NOT NULL,
	"workflow" text,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"conclusion" text,
	"event" text NOT NULL,
	"branch" text,
	"commit_sha" text NOT NULL,
	"started_at" timestamp with time zone,
	CONSTRAINT "github_runs_connection_id_github_id_pk" PRIMARY KEY("connection_id","github_id")
);
--> statement-breakpoint
ALTER TABLE "github_issues" ADD CONSTRAINT "github_issues_connection_id_github_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."github_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_pulls" ADD CONSTRAINT "github_pulls_connection_id_github_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."github_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_runs" ADD CONSTRAINT "github_runs_connection_id_github_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."github_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "github_issues_updated_idx" ON "github_issues" USING btree ("connection_id","github_updated_at");--> statement-breakpoint
CREATE INDEX "github_pulls_updated_idx" ON "github_pulls" USING btree ("connection_id","github_updated_at");--> statement-breakpoint
CREATE INDEX "github_runs_updated_idx" ON "github_runs" USING btree ("connection_id","github_updated_at");