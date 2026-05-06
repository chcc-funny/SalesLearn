import {
  pgTable,
  uuid,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import { scripts } from "./scripts";
import { scriptTags } from "./script-tags";

export const scriptTagRelations = pgTable(
  "script_tag_relations",
  {
    scriptId: uuid("script_id")
      .notNull()
      .references(() => scripts.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => scriptTags.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({
      name: "script_tag_relations_pkey",
      columns: [table.scriptId, table.tagId],
    }),
    index("idx_script_tag_relations_tag").on(table.tagId),
  ]
);

export type ScriptTagRelation = typeof scriptTagRelations.$inferSelect;
export type NewScriptTagRelation = typeof scriptTagRelations.$inferInsert;
