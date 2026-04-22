import {
  pgTable,
  uuid,
  integer,
  real,
  boolean,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { knowledgeBase } from "./knowledge-base";

export const userLearningProgress = pgTable(
  "user_learning_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    knowledgeId: uuid("knowledge_id")
      .notNull()
      .references(() => knowledgeBase.id),
    viewDuration: integer("view_duration").default(0),
    scrollDepth: real("scroll_depth").default(0),
    isCompleted: boolean("is_completed").default(false),
    isFavorited: boolean("is_favorited").default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [unique("uq_user_knowledge").on(table.userId, table.knowledgeId)]
);

export type UserLearningProgress = typeof userLearningProgress.$inferSelect;
export type NewUserLearningProgress = typeof userLearningProgress.$inferInsert;
