CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE "scripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"customer_question" text NOT NULL,
	"question_aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"answer" text NOT NULL,
	"source" varchar(20) NOT NULL,
	"knowledge_id" uuid,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"reject_reason" text,
	"submission_request_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scripts_submission_request_id_unique" UNIQUE("submission_request_id"),
	CONSTRAINT "scripts_usage_count_non_negative" CHECK ("scripts"."usage_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "script_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"group_key" varchar(20) NOT NULL,
	"name" varchar(50) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_script_tags_tenant_group_name" UNIQUE("tenant_id","group_key","name")
);
--> statement-breakpoint
CREATE TABLE "script_tag_relations" (
	"script_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "script_tag_relations_pkey" PRIMARY KEY("script_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "script_copy_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"script_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"copied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_knowledge_id_knowledge_base_id_fk" FOREIGN KEY ("knowledge_id") REFERENCES "public"."knowledge_base"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_tag_relations" ADD CONSTRAINT "script_tag_relations_script_id_scripts_id_fk" FOREIGN KEY ("script_id") REFERENCES "public"."scripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_tag_relations" ADD CONSTRAINT "script_tag_relations_tag_id_script_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."script_tags"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_copy_logs" ADD CONSTRAINT "script_copy_logs_script_id_scripts_id_fk" FOREIGN KEY ("script_id") REFERENCES "public"."scripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_copy_logs" ADD CONSTRAINT "script_copy_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_scripts_tenant_status" ON "scripts" USING btree ("tenant_id","status") WHERE "scripts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_scripts_source" ON "scripts" USING btree ("tenant_id","source");--> statement-breakpoint
CREATE INDEX "idx_scripts_knowledge" ON "scripts" USING btree ("knowledge_id");--> statement-breakpoint
CREATE INDEX "idx_script_tags_group" ON "script_tags" USING btree ("tenant_id","group_key","is_active");--> statement-breakpoint
CREATE INDEX "idx_script_tag_relations_tag" ON "script_tag_relations" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "idx_script_copy_logs_script" ON "script_copy_logs" USING btree ("script_id","copied_at");--> statement-breakpoint
CREATE INDEX "idx_script_copy_logs_user" ON "script_copy_logs" USING btree ("user_id","copied_at");--> statement-breakpoint
CREATE INDEX "idx_scripts_trgm_question" ON "scripts" USING GIN ("customer_question" gin_trgm_ops) WHERE "scripts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_scripts_trgm_title" ON "scripts" USING GIN ("title" gin_trgm_ops) WHERE "scripts"."deleted_at" IS NULL;