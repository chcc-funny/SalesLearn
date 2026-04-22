import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { knowledgeBase } from "./knowledge-base";

export const questionTypes = [
  "memory",
  "understanding",
  "application",
  "analysis",
] as const;
export type QuestionType = (typeof questionTypes)[number];

export const questionStatuses = [
  "reviewing",
  "published",
  "rejected",
] as const;
export type QuestionStatus = (typeof questionStatuses)[number];

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    knowledgeId: uuid("knowledge_id")
      .notNull()
      .references(() => knowledgeBase.id),
    type: varchar("type", { length: 30 }).notNull(),
    questionText: text("question_text").notNull(),
    options: jsonb("options").notNull(),
    correctAnswer: varchar("correct_answer", { length: 1 }).notNull(),
    explanations: jsonb("explanations").notNull(),
    status: varchar("status", { length: 20 }).default("reviewing"),
    qualityTag: varchar("quality_tag", { length: 20 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_questions_knowledge").on(table.knowledgeId, table.status),
    index("idx_questions_tenant").on(table.tenantId, table.status),
  ]
);

export type Question = typeof questions.$inferSelect;
export type NewQuestion = typeof questions.$inferInsert;
