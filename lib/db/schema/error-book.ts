import {
  pgTable,
  uuid,
  integer,
  boolean,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { knowledgeBase } from "./knowledge-base";
import { questions } from "./questions";

export const errorBook = pgTable(
  "error_book",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    knowledgeId: uuid("knowledge_id")
      .notNull()
      .references(() => knowledgeBase.id),
    questionId: uuid("question_id").references(() => questions.id),
    nextReviewAt: timestamp("next_review_at", {
      withTimezone: true,
    }).notNull(),
    reviewCount: integer("review_count").default(0),
    correctStreak: integer("correct_streak").default(0),
    isResolved: boolean("is_resolved").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("uq_user_question").on(table.userId, table.questionId),
    index("idx_error_book_review").on(
      table.userId,
      table.isResolved,
      table.nextReviewAt
    ),
  ]
);

export type ErrorBook = typeof errorBook.$inferSelect;
export type NewErrorBook = typeof errorBook.$inferInsert;
