import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const items = sqliteTable("items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
