import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  real,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { knowledgeBase } from "./knowledge-base";

export const feynmanStages = ["A", "B"] as const;
export type FeynmanStage = (typeof feynmanStages)[number];

export const feynmanPersonas = ["beginner", "bargainer", "expert"] as const;
export type FeynmanPersona = (typeof feynmanPersonas)[number];

export const userFeynmanRecords = pgTable(
  "user_feynman_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    knowledgeId: uuid("knowledge_id")
      .notNull()
      .references(() => knowledgeBase.id),
    stage: varchar("stage", { length: 1 }).notNull(),
    audioUrl: varchar("audio_url", { length: 500 }),
    transcript: text("transcript"),
    scores: jsonb("scores"),
    coveredPoints: jsonb("covered_points"),
    missedPoints: jsonb("missed_points"),
    errors: jsonb("errors"),
    aiFeedback: text("ai_feedback"),
    totalScore: real("total_score"),
    persona: varchar("persona", { length: 20 }),
    chatHistory: jsonb("chat_history"),
    isPassed: boolean("is_passed").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_feynman_user").on(
      table.userId,
      table.knowledgeId,
      table.stage
    ),
  ]
);

export type UserFeynmanRecord = typeof userFeynmanRecords.$inferSelect;
export type NewUserFeynmanRecord = typeof userFeynmanRecords.$inferInsert;
