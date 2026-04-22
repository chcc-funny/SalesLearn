import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const knowledgeCategories = [
  "product",
  "objection",
  "closing",
  "psychology",
] as const;
export type KnowledgeCategory = (typeof knowledgeCategories)[number];

export const knowledgeStatuses = ["draft", "reviewing", "published"] as const;
export type KnowledgeStatus = (typeof knowledgeStatuses)[number];

export const knowledgeBase = pgTable(
  "knowledge_base",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    category: varchar("category", { length: 50 }).notNull(),
    keyPoints: jsonb("key_points").notNull().default([]),
    content: text("content").notNull(),
    examples: text("examples"),
    commonMistakes: text("common_mistakes"),
    images: jsonb("images").default([]),
    status: varchar("status", { length: 20 }).default("draft"),
    sourceFileUrl: varchar("source_file_url", { length: 500 }),
    createdBy: uuid("created_by").references(() => users.id),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_knowledge_tenant_status").on(table.tenantId, table.status),
    index("idx_knowledge_category").on(table.tenantId, table.category),
  ]
);

export type KnowledgeBase = typeof knowledgeBase.$inferSelect;
export type NewKnowledgeBase = typeof knowledgeBase.$inferInsert;
