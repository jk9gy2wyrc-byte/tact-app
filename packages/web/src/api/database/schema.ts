import { sql } from "drizzle-orm";
import { text, integer, real, sqliteTable } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  login: text("login").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("user"),
  email: text("email"),
  country: text("country"),
  ip: text("ip"),
  fp: text("fp"),
  ref: text("ref"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const emailCodes = sqliteTable("email_codes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  code: text("code").notNull(),
  expiresAt: integer("expires_at").notNull(), // unix ms
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const backtestTrades = sqliteTable("backtest_trades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  instrument: text("instrument").notNull(),
  year: integer("year").notNull(),
  month: text("month").notNull(),
  tradeNum: integer("trade_num").notNull(),
  direction: text("direction"),
  rr: real("rr"),
  session: text("session"),
  result: text("result"),
  grossR: real("gross_r"),
  cost: real("cost"),
  netR: real("net_r"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const liveTrades = sqliteTable("live_trades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1),
  month: text("month").notNull(),
  tradeNum: integer("trade_num").notNull(),
  asset: text("asset"),
  direction: text("direction"),
  rr: real("rr"),
  session: text("session"),
  result: text("result"),
  grossR: real("gross_r"),
  cost: real("cost").default(-0.1),
  netR: real("net_r"),
  profitDollars: real("profit_dollars"),
  notes: text("notes"),
  attachments: text("attachments"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export const userPrefs = sqliteTable("user_prefs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  key: text("key").notNull(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export const refLinks = sqliteTable("ref_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),   // e.g. "discord-server"
  label: text("label").notNull(),          // e.g. "Discord Server"
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const subscriptionSettings = sqliteTable("subscription_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }).default(1),
  buttonText: text("button_text").notNull().default("Contact Us"),
  buttonUrl: text("button_url").notNull().default(""),
  contactMessage: text("contact_message").default(""),
  plansJson: text("plans_json").notNull().default("{}"),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});
