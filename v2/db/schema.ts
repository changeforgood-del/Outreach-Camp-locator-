import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const camps = sqliteTable(
  "camps",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    label: text("label").notNull(),
    notes: text("notes").notNull().default(""),
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
    status: text("status", { enum: ["active", "needs_check", "inactive"] })
      .notNull()
      .default("needs_check"),
    createdBy: text("created_by").notNull().default("Outreach worker"),
    createdById: text("created_by_id").notNull().default("unknown"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastConfirmedAt: text("last_confirmed_at"),
  },
  (table) => [
    index("idx_camps_status_updated").on(table.status, table.updatedAt),
  ],
);

export const confirmations = sqliteTable(
  "confirmations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    campId: integer("camp_id")
      .notNull()
      .references(() => camps.id, { onDelete: "cascade" }),
    verdict: text("verdict", {
      enum: ["still_here", "not_there", "needs_followup"],
    }).notNull(),
    note: text("note").notNull().default(""),
    confirmedBy: text("confirmed_by").notNull().default("Outreach worker"),
    confirmedById: text("confirmed_by_id").notNull().default("unknown"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_confirmations_camp_created").on(table.campId, table.createdAt),
  ],
);
