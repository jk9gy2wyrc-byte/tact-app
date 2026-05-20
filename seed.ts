#!/usr/bin/env bun
/**
 * Seed script — reads TSCT_Full.xlsx and inserts all real data into DB.
 * Clears existing data first. Run: bun seed.ts
 */
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { backtestTrades, liveTrades } from "./packages/web/src/api/database/schema";
import * as XLSX from "xlsx";

const client = createClient({
  url: process.env.DATABASE_URL!,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});
const db = drizzle(client, { schema: { backtestTrades, liveTrades } });

function normalizeMonth(raw: string): string {
  // "2021 - 01" → "2021-01"
  return String(raw).replace(/\s*-\s*/g, '-').trim();
}

function parseSheet(
  ws: XLSX.WorkSheet,
  instrument: string
): (typeof backtestTrades.$inferInsert)[] {
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const trades: (typeof backtestTrades.$inferInsert)[] = [];

  for (const row of rows) {
    if (!row || row.length < 6) continue;
    const id = row[0];
    if (id === 'ID' || id == null || id === '') continue;
    if (id === 'SUMMARY') continue;

    // Validate: id must be a number, direction must be long/short
    const idNum = typeof id === 'number' ? id : Number(id);
    if (!Number.isFinite(idNum)) continue;

    const dateRaw = String(row[1] ?? '').trim();
    const direction = String(row[2] ?? '').trim().toLowerCase();
    const rr = typeof row[3] === 'number' ? row[3] : parseFloat(String(row[3] ?? ''));
    const session = String(row[4] ?? '').trim().toLowerCase();
    const result = String(row[5] ?? '').trim().toLowerCase();
    const grossR = typeof row[6] === 'number' ? row[6] : parseFloat(String(row[6] ?? ''));
    const cost = typeof row[8] === 'number' ? row[8] : parseFloat(String(row[8] ?? '-0.1'));

    if (!['long', 'short'].includes(direction)) continue;
    if (!['tp', 'sl', 'be'].includes(result)) continue;
    if (!Number.isFinite(grossR)) continue;

    const month = normalizeMonth(dateRaw);
    const year = parseInt(month.slice(0, 4)) || 2025;
    const validCost = Number.isFinite(cost) ? cost : -0.1;
    const netR = Math.round((grossR + validCost) * 100) / 100;

    trades.push({
      instrument,
      year,
      month,
      tradeNum: idNum,
      direction,
      rr: Number.isFinite(rr) ? rr : null,
      session: session || null,
      result,
      grossR,
      cost: validCost,
      netR,
    });
  }

  return trades;
}

function parseLiveSheet(ws: XLSX.WorkSheet): (typeof liveTrades.$inferInsert)[] {
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const trades: (typeof liveTrades.$inferInsert)[] = [];

  for (const row of rows) {
    if (!row || row.length < 6) continue;
    const id = row[0];
    if (id === 'ID' || id == null || id === '') continue;
    if (id === 'SUMMARY') continue;

    const idNum = typeof id === 'number' ? id : Number(id);
    if (!Number.isFinite(idNum)) continue;

    const dateRaw = String(row[1] ?? '').trim();
    const direction = String(row[2] ?? '').trim().toLowerCase();
    const rr = typeof row[3] === 'number' ? row[3] : parseFloat(String(row[3] ?? ''));
    const session = String(row[4] ?? '').trim().toLowerCase();
    const result = String(row[5] ?? '').trim().toLowerCase();
    const grossR = typeof row[6] === 'number' ? row[6] : parseFloat(String(row[6] ?? ''));
    const cost = typeof row[8] === 'number' ? row[8] : parseFloat(String(row[8] ?? '-0.1'));

    if (!['long', 'short'].includes(direction)) continue;
    if (!['tp', 'sl', 'be'].includes(result)) continue;
    if (!Number.isFinite(grossR)) continue;

    const month = normalizeMonth(dateRaw);
    const validCost = Number.isFinite(cost) ? cost : -0.1;
    const netR = Math.round((grossR + validCost) * 100) / 100;

    trades.push({
      month,
      tradeNum: idNum,
      direction,
      rr: Number.isFinite(rr) ? rr : null,
      session: session || null,
      result,
      grossR,
      cost: validCost,
      netR,
    });
  }

  return trades;
}

async function insertBatch<T>(table: any, items: T[], batchSize = 50) {
  for (let i = 0; i < items.length; i += batchSize) {
    await db.insert(table).values(items.slice(i, i + batchSize) as any[]);
  }
}

async function main() {
  console.log("Loading TSCT_Full.xlsx...");
  const wb = XLSX.readFile("/home/user/TSCT_Full.xlsx");

  // Parse all sheets
  const eurSheet = wb.Sheets["EUR Raw Backtest Database 21-25"];
  const gerSheet = wb.Sheets["GER Raw Backtest Database 25"];
  const xauSheet = wb.Sheets["XAU Raw Backtest Database 25"];
  const liveSheet = wb.Sheets["Live Raw Database"];

  const eurTrades = parseSheet(eurSheet, "EUR");
  const gerTrades = parseSheet(gerSheet, "GER");
  const xauTrades = parseSheet(xauSheet, "XAU");
  const liveTds = parseLiveSheet(liveSheet);

  console.log(`Parsed: EUR=${eurTrades.length}, GER=${gerTrades.length}, XAU=${xauTrades.length}, Live=${liveTds.length}`);

  // Clear existing data
  console.log("Clearing existing data...");
  await db.delete(backtestTrades);
  await db.delete(liveTrades);

  // Insert backtest
  const allBT = [...eurTrades, ...gerTrades, ...xauTrades];
  console.log(`Inserting ${allBT.length} backtest trades...`);
  await insertBatch(backtestTrades, allBT);

  // Insert live
  console.log(`Inserting ${liveTds.length} live trades...`);
  await insertBatch(liveTrades, liveTds);

  console.log("Done! Seed complete.");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
