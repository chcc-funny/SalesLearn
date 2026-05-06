import {
  pgTable,
  bigserial,
  uuid,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { scripts } from "./scripts";

export const scriptCopyLogs = pgTable(
  "script_copy_logs",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    scriptId: uuid("script_id")
      .notNull()
      .references(() => scripts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    copiedAt: timestamp("copied_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_script_copy_logs_script").on(table.scriptId, table.copiedAt),
    index("idx_script_copy_logs_user").on(table.userId, table.copiedAt),
  ]
);

export type ScriptCopyLog = typeof scriptCopyLogs.$inferSelect;
export type NewScriptCopyLog = typeof scriptCopyLogs.$inferInsert;
