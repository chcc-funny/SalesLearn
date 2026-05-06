import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";

export const scriptTagGroupKeys = ["scene", "product"] as const;
export type ScriptTagGroupKey = (typeof scriptTagGroupKeys)[number];

export const scriptTags = pgTable(
  "script_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    groupKey: varchar("group_key", { length: 20 }).notNull(),
    name: varchar("name", { length: 50 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_script_tags_tenant_group_name").on(
      table.tenantId,
      table.groupKey,
      table.name
    ),
    index("idx_script_tags_group").on(
      table.tenantId,
      table.groupKey,
      table.isActive
    ),
  ]
);

export type ScriptTag = typeof scriptTags.$inferSelect;
export type NewScriptTag = typeof scriptTags.$inferInsert;
