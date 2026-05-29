import { sql } from "drizzle-orm";
import { text, integer, real, sqliteTable } from "drizzle-orm/sqlite-core";

// Users (auth)
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  login: text("login").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("user"), // "admin" | "user"
  notes: text("notes"), // admin notes about the user
  accessExpiryDate: text("access_expiry_date"), // ISO date string when access expires
  accessStatus: text("access_status").notNull().default("active"), // "active" | "suspended"
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

// Backtest trades (from xlsx uploads or manual)
export const backtestTrades = sqliteTable("backtest_trades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // owner
  instrument: text("instrument").notNull(), // EUR, GER, XAU
  year: integer("year").notNull(),
  month: text("month").notNull(),
  tradeNum: integer("trade_num").notNull(),
  direction: text("direction"), // long/short
  rr: real("rr"),
  session: text("session"),
  result: text("result"), // tp/sl/be
  grossR: real("gross_r"),
  cost: real("cost"),
  netR: real("net_r"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

// Live trades
export const liveTrades = sqliteTable("live_trades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().default(1), // owner
  month: text("month").notNull(), // e.g. "2026-03"
  tradeNum: integer("trade_num").notNull(),
  asset: text("asset"), // e.g. "EUR/USD", "XAU/USD" — visual label only
  direction: text("direction"),
  rr: real("rr"),
  session: text("session"),
  result: text("result"), // tp/sl/be
  grossR: real("gross_r"),
  cost: real("cost").default(-0.1),
  netR: real("net_r"),
  profitDollars: real("profit_dollars"),           // $ P&L
  notes: text("notes"),                            // free-text notes
  attachments: text("attachments"),                // JSON: [{type:'image'|'link', url, label}]
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});
