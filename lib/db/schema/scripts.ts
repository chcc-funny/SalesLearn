import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  integer,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { knowledgeBase } from "./knowledge-base";

export const scriptStatuses = [
  "draft",
  "pending_review",
  "published",
  "rejected",
  "archived",
] as const;
export type ScriptStatus = (typeof scriptStatuses)[number];

export const scriptSources = [
  "curated",
  "from_knowledge",
  "ai_submitted",
] as const;
export type ScriptSource = (typeof scriptSources)[number];

export const scripts = pgTable(
  "scripts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    customerQuestion: text("customer_question").notNull(),
    questionAliases: jsonb("question_aliases").notNull().default([]),
    answer: text("answer").notNull(),
    source: varchar("source", { length: 20 }).notNull(),
    knowledgeId: uuid("knowledge_id").references(() => knowledgeBase.id, {
      onDelete: "set null",
    }),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    usageCount: integer("usage_count").notNull().default(0),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    rejectReason: text("reject_reason"),
    submissionRequestId: uuid("submission_request_id").unique(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_scripts_tenant_status")
      .on(table.tenantId, table.status)
      .where(sql`${table.deletedAt} IS NULL`),
    index("idx_scripts_source").on(table.tenantId, table.source),
    index("idx_scripts_knowledge").on(table.knowledgeId),
    check("scripts_usage_count_non_negative", sql`${table.usageCount} >= 0`),
  ]
);

export type Script = typeof scripts.$inferSelect;
export type NewScript = typeof scripts.$inferInsert;
