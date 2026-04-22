import {
  pgTable,
  uuid,
  varchar,
  boolean,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { questions } from "./questions";

export const userTestRecords = pgTable(
  "user_test_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id),
    selectedAnswer: varchar("selected_answer", { length: 1 }).notNull(),
    isCorrect: boolean("is_correct").notNull(),
    timeSpent: integer("time_spent"),
    answeredAt: timestamp("answered_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_test_records_user").on(table.userId, table.answeredAt),
    index("idx_test_records_question").on(table.questionId),
  ]
);

export type UserTestRecord = typeof userTestRecords.$inferSelect;
export type NewUserTestRecord = typeof userTestRecords.$inferInsert;
