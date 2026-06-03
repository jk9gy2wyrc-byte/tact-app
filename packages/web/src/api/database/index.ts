import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

let url: string;
let authToken: string | undefined;

if (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith("file:")) {
  // Turso (production)
  url = process.env.DATABASE_URL;
  authToken = process.env.DATABASE_AUTH_TOKEN;
} else {
  // Local SQLite (dev)
  const dbDir = path.resolve(process.cwd(), "data");
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  url = `file:${path.join(dbDir, "tact.db")}`;
}

const client = createClient({ url, authToken });

export const db = drizzle(client, { schema });
