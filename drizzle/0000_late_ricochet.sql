CREATE TABLE "error_book" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"knowledge_id" uuid NOT NULL,
	"question_id" uuid,
	"next_review_at" timestamp with time zone NOT NULL,
	"review_count" integer DEFAULT 0,
	"correct_streak" integer DEFAULT 0,
	"is_resolved" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_user_question" UNIQUE("user_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"phone" varchar(20),
	"email" varchar(255),
	"password_hash" varchar(255) NOT NULL,
	"role" varchar(20) DEFAULT 'employee' NOT NULL,
	"shop_id" uuid,
	"avatar_url" varchar(500),
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "knowledge_base" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"category" varchar(50) NOT NULL,
	"key_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content" text NOT NULL,
	"examples" text,
	"common_mistakes" text,
	"images" jsonb DEFAULT '[]'::jsonb,
	"status" varchar(20) DEFAULT 'draft',
	"source_file_url" varchar(500),
	"created_by" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"knowledge_id" uuid NOT NULL,
	"type" varchar(30) NOT NULL,
	"question_text" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_answer" varchar(1) NOT NULL,
	"explanations" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'reviewing',
	"quality_tag" varchar(20),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_test_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"selected_answer" varchar(1) NOT NULL,
	"is_correct" boolean NOT NULL,
	"time_spent" integer,
	"answered_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_learning_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"knowledge_id" uuid NOT NULL,
	"view_duration" integer DEFAULT 0,
	"scroll_depth" real DEFAULT 0,
	"is_completed" boolean DEFAULT false,
	"is_favorited" boolean DEFAULT false,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_user_knowledge" UNIQUE("user_id","knowledge_id")
);
--> statement-breakpoint
CREATE TABLE "user_feynman_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"knowledge_id" uuid NOT NULL,
	"stage" varchar(1) NOT NULL,
	"audio_url" varchar(500),
	"transcript" text,
	"scores" jsonb,
	"covered_points" jsonb,
	"missed_points" jsonb,
	"errors" jsonb,
	"ai_feedback" text,
	"total_score" real,
	"persona" varchar(20),
	"chat_history" jsonb,
	"is_passed" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "error_book" ADD CONSTRAINT "error_book_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_book" ADD CONSTRAINT "error_book_knowledge_id_knowledge_base_id_fk" FOREIGN KEY ("knowledge_id") REFERENCES "public"."knowledge_base"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_book" ADD CONSTRAINT "error_book_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base" ADD CONSTRAINT "knowledge_base_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base" ADD CONSTRAINT "knowledge_base_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_knowledge_id_knowledge_base_id_fk" FOREIGN KEY ("knowledge_id") REFERENCES "public"."knowledge_base"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_test_records" ADD CONSTRAINT "user_test_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_test_records" ADD CONSTRAINT "user_test_records_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_learning_progress" ADD CONSTRAINT "user_learning_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_learning_progress" ADD CONSTRAINT "user_learning_progress_knowledge_id_knowledge_base_id_fk" FOREIGN KEY ("knowledge_id") REFERENCES "public"."knowledge_base"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feynman_records" ADD CONSTRAINT "user_feynman_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feynman_records" ADD CONSTRAINT "user_feynman_records_knowledge_id_knowledge_base_id_fk" FOREIGN KEY ("knowledge_id") REFERENCES "public"."knowledge_base"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_error_book_review" ON "error_book" USING btree ("user_id","is_resolved","next_review_at");--> statement-breakpoint
CREATE INDEX "idx_users_tenant" ON "users" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_users_role" ON "users" USING btree ("tenant_id","role");--> statement-breakpoint
CREATE INDEX "idx_knowledge_tenant_status" ON "knowledge_base" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_knowledge_category" ON "knowledge_base" USING btree ("tenant_id","category");--> statement-breakpoint
CREATE INDEX "idx_questions_knowledge" ON "questions" USING btree ("knowledge_id","status");--> statement-breakpoint
CREATE INDEX "idx_questions_tenant" ON "questions" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_test_records_user" ON "user_test_records" USING btree ("user_id","answered_at");--> statement-breakpoint
CREATE INDEX "idx_test_records_question" ON "user_test_records" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "idx_feynman_user" ON "user_feynman_records" USING btree ("user_id","knowledge_id","stage");