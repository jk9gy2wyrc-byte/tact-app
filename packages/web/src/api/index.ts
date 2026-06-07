import { Hono } from 'hono';
import { cors } from "hono/cors";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "./database";
import { backtestTrades, emailCodes, liveTrades, subscriptionSettings, userPrefs, users } from "./database/schema";
import { eq, desc, asc, sql, lt } from "drizzle-orm";
import * as XLSX from "xlsx";
import { DEFAULT_SUBSCRIPTION_SETTINGS } from "../shared/subscription";
// Email sending via Brevo

// ─── disposable email domains list ───────────────────────────────────────────
import disposableDomains from 'disposable-email-domains';
const DISPOSABLE_SET = new Set<string>(disposableDomains as string[]);
const isDisposableEmail = (email: string) => {
  const domain = email.split('@')[1]?.toLowerCase();
  return domain ? DISPOSABLE_SET.has(domain) : false;
};

type UserRoleName = 'admin' | 'free' | 'paid' | 'free-trial' | 'no-access';

const normalizeRole = (role: string | null | undefined): UserRoleName => {
  if (role === 'admin') return 'admin';
  if (role === 'paid') return 'paid';
  if (role === 'free-trial' || role === 'trial') return 'free-trial';
  if (role === 'no-access') return 'no-access';
  return 'free';
};

const parseDbDate = (value?: string | null): number | null => {
  if (!value) return null;
  const isoLike = value.includes('T') ? value : value.replace(' ', 'T');
  const withZone = isoLike.endsWith('Z') ? isoLike : `${isoLike}Z`;
  const ms = Date.parse(withZone);
  return Number.isNaN(ms) ? null : ms;
};

const subscriptionPlansSchema = z.object({
  firstPurchase: z.object({
    freeWeeks: z.number().int().min(0).max(12),
    monthlyPrice: z.number().min(0).max(100_000),
  }),
  monthlyPlans: z.array(z.object({
    months: z.number().int().min(1).max(120),
    price: z.number().min(0).max(100_000),
  })).min(1).max(12),
});

const subscriptionSettingsUpdateSchema = z.object({
  asLogin: z.string().min(1),
  buttonText: z.string().min(2).max(120),
  buttonUrl: z.string().max(1024).optional(),
  contactMessage: z.string().max(500).optional(),
  plans: subscriptionPlansSchema,
});

type SubscriptionSettingsRow = typeof subscriptionSettings.$inferSelect;

type SubscriptionSettingsResponse = {
  buttonText: string;
  buttonUrl: string;
  contactMessage: string;
  plans: z.infer<typeof subscriptionPlansSchema>;
  updatedAt: string | null;
};

let emailTablesReady: Promise<void> | null = null;

const ensureEmailTables = async () => {
  if (!emailTablesReady) {
    emailTablesReady = Promise.all([
      db.run(sql`ALTER TABLE users ADD COLUMN email TEXT`).catch(() => {}),
      db.run(sql`ALTER TABLE users ADD COLUMN country TEXT`).catch(() => {}),
      db.run(sql`ALTER TABLE users ADD COLUMN ip TEXT`).catch(() => {}),
      db.run(sql`ALTER TABLE users ADD COLUMN fp TEXT`).catch(() => {}),
      db.run(sql`
        CREATE TABLE IF NOT EXISTS email_codes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL,
          code TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `),
    ]).then(() => {});
  }
  return emailTablesReady;
};

let subscriptionTableReady: Promise<void> | null = null;

const ensureSubscriptionTable = async () => {
  if (!subscriptionTableReady) {
    subscriptionTableReady = db.run(sql`
      CREATE TABLE IF NOT EXISTS subscription_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        button_text TEXT NOT NULL DEFAULT 'Contact Us',
        button_url TEXT NOT NULL DEFAULT '',
        plans_json TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).then(() =>
      db.run(sql`ALTER TABLE subscription_settings ADD COLUMN contact_message TEXT DEFAULT ''`).catch(() => {})
    ).then(() => {});
  }
  return subscriptionTableReady;
};

let userPrefsTableReady: Promise<void> | null = null;

const ensureUserPrefsTable = async () => {
  if (!userPrefsTableReady) {
    userPrefsTableReady = db.run(sql`
      CREATE TABLE IF NOT EXISTS user_prefs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(user_id, key)
      )
    `).then(() => {});
  }
  return userPrefsTableReady;
};

const parsePlans = (raw?: string | null): z.infer<typeof subscriptionPlansSchema> => {
  if (!raw) return DEFAULT_SUBSCRIPTION_SETTINGS.plans;
  try {
    const parsed = JSON.parse(raw);
    const result = subscriptionPlansSchema.safeParse(parsed);
    if (result.success) return result.data;
  } catch {}
  return DEFAULT_SUBSCRIPTION_SETTINGS.plans;
};

const mapSubscriptionRow = (row: SubscriptionSettingsRow): SubscriptionSettingsResponse => ({
  buttonText: row.buttonText,
  buttonUrl: row.buttonUrl,
  contactMessage: row.contactMessage ?? '',
  plans: parsePlans(row.plansJson),
  updatedAt: row.updatedAt ?? null,
});

const ensureSubscriptionRow = async (): Promise<SubscriptionSettingsRow> => {
  await ensureSubscriptionTable();
  const existing = await db.select().from(subscriptionSettings).limit(1).get();
  if (existing) return existing;
  const [created] = await db.insert(subscriptionSettings).values({
    buttonText: DEFAULT_SUBSCRIPTION_SETTINGS.buttonText,
    buttonUrl: DEFAULT_SUBSCRIPTION_SETTINGS.buttonUrl,
    plansJson: JSON.stringify(DEFAULT_SUBSCRIPTION_SETTINGS.plans),
  }).returning();
  return created;
};

const app = new Hono()
  .basePath('api')
  .use(cors({ origin: (origin) => origin ?? "*", credentials: true }))

  // ─── HEALTH ───────────────────────────────────────────────────────────────
  .get('/health', (c) => c.json({ status: 'ok' }, 200))

  // ─── AUTH: SEED ADMIN + LOGIN + REGISTER ──────────────────────────────────
  .get('/auth/seed', async (c) => {
    // Run any pending migrations (idempotent, errors ignored)
    await Promise.all([
      db.run(sql`ALTER TABLE users ADD COLUMN email TEXT`).catch(() => {}),
      db.run(sql`ALTER TABLE users ADD COLUMN country TEXT`).catch(() => {}),
      db.run(sql`ALTER TABLE users ADD COLUMN ip TEXT`).catch(() => {}),
      db.run(sql`ALTER TABLE users ADD COLUMN fp TEXT`).catch(() => {}),
    ]);
    // Ensure admin user exists with correct role
    const existing = await db.select().from(users).where(eq(users.login, 'whatif')).get();
    if (!existing) {
      await db.insert(users).values({ login: 'whatif', password: '7777', role: 'admin' });
    } else if (existing.role !== 'admin') {
      await db.update(users).set({ role: 'admin' }).where(eq(users.login, 'whatif'));
    }
    return c.json({ ok: true }, 200);
  })

  .post('/auth/login',
    zValidator('json', z.object({ login: z.string(), password: z.string() })),
    async (c) => {
      const { login, password } = c.req.valid('json');
      const user = await db.select().from(users).where(eq(users.login, login)).get();
      if (!user || user.password !== password) {
        return c.json({ error: 'Невірний логін або пароль' }, 401);
      }
      const role = normalizeRole(user.role);
      return c.json({
        id: user.id,
        login: user.login,
        role,
        createdAt: user.createdAt ?? null,
      }, 200);
    }
  )

  .post('/auth/register',
    zValidator('json', z.object({ login: z.string().min(3).max(32), password: z.string().min(4), fp: z.string().optional() })),
    async (c) => {
      await ensureEmailTables();
      const { login, password, fp } = c.req.valid('json');
      const existing = await db.select().from(users).where(eq(users.login, login)).get();
      if (existing) return c.json({ error: 'Логін вже зайнятий' }, 409);
      // fingerprint check
      if (fp) {
        const fpUsed = await db.select().from(users).where(eq(users.fp, fp)).get();
        if (fpUsed) return c.json({ error: 'Пробний період для цього пристрою вже використано' }, 403);
      }
      let regIp: string | null = null;
      let regCountry: string | null = null;
      try {
        const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0].trim() || c.req.header('x-real-ip');
        if (ip && ip !== '127.0.0.1' && ip !== '::1') {
          regIp = ip;
          const geo = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`).then(r => r.json()).catch(() => null);
          if (geo?.countryCode) regCountry = geo.countryCode;
        }
      } catch {}
      const [newUser] = await db.insert(users).values({
        login,
        password,
        role: 'free-trial',
        ip: regIp,
        country: regCountry,
        fp: fp ?? null,
      }).returning();
      return c.json({
        id: newUser.id,
        login: newUser.login,
        role: normalizeRole(newUser.role),
        createdAt: newUser.createdAt ?? null,
      }, 200);
    }
  )

  // ─── EMAIL VERIFICATION: send code ───────────────────────────────────────
  .post('/auth/send-code',
    zValidator('json', z.object({ email: z.string().email() })),
    async (c) => {
      await ensureEmailTables();
      const { email } = c.req.valid('json');
      // block disposable emails
      if (isDisposableEmail(email)) return c.json({ error: 'Тимчасові поштові адреси не дозволені' }, 400);
      // check email not already used
      const existing = await db.select().from(users).where(eq(users.email, email)).get();
      if (existing) return c.json({ error: 'Ця пошта вже зареєстрована' }, 409);
      // cleanup old codes for this email
      await db.delete(emailCodes).where(eq(emailCodes.email, email));
      // generate 4-digit code
      const code = String(Math.floor(1000 + Math.random() * 9000));
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 хвилин
      await db.insert(emailCodes).values({ email, code, expiresAt });
      // send email via Brevo
      const brevoKey = process.env.BREVO_API_KEY;
      if (!brevoKey) {
        console.log(`[DEV] Email code for ${email}: ${code}`);
        return c.json({ ok: true, devCode: code }, 200);
      }
      try {
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'api-key': brevoKey,
          },
          body: JSON.stringify({
            sender: { name: 'TSCT', email: 'tsctsupport@gmail.com' },
            to: [{ email }],
            subject: 'Код підтвердження TSCT',
            htmlContent: `
              <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:32px;background:#0d0f11;color:#e2e8f0;border-radius:16px">
                <div style="font-size:20px;font-weight:700;margin-bottom:16px">TSCT</div>
                <p style="color:#94a3b8;margin-bottom:24px">Ваш код підтвердження для реєстрації:</p>
                <div style="font-size:40px;font-weight:700;letter-spacing:12px;text-align:center;padding:20px;background:#1a1d2a;border-radius:12px;color:#fff">${code}</div>
                <p style="color:#94a3b8;font-size:12px;margin-top:20px">Код дійсний 10 хвилин. Якщо ви не реєструвались — проігноруйте цей лист.</p>
              </div>
            `,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error('[Brevo error]', JSON.stringify(err));
          return c.json({ error: `Brevo: ${err?.message || err?.code || JSON.stringify(err)}` }, 500);
        }
      } catch (e) {
        return c.json({ error: 'Не вдалося надіслати лист. Перевірте адресу.' }, 500);
      }
      return c.json({ ok: true }, 200);
    }
  )

  // ─── SIMPLE REGISTER (no email code) ─────────────────────────────────────
  .post('/auth/register-simple',
    zValidator('json', z.object({
      email: z.string().email(),
      password: z.string().min(4),
      fp: z.string().optional(),
    })),
    async (c) => {
      await ensureEmailTables();
      const { email, password, fp } = c.req.valid('json');
      // block disposable emails
      if (isDisposableEmail(email)) return c.json({ error: 'Тимчасові поштові адреси не дозволені' }, 400);
      // check email not already used
      const emailUsed = await db.select().from(users).where(eq(users.email, email)).get();
      if (emailUsed) return c.json({ error: 'Ця пошта вже зареєстрована' }, 409);
      // fingerprint check
      if (fp) {
        const fpUsed = await db.select().from(users).where(eq(users.fp, fp)).get();
        if (fpUsed) return c.json({ error: 'Пробний період для цього пристрою вже використано' }, 403);
      }
      // detect country by IP
      let country: string | null = null;
      let userIp: string | null = null;
      try {
        const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0].trim() || c.req.header('x-real-ip');
        if (ip && ip !== '127.0.0.1' && ip !== '::1') {
          userIp = ip;
          const geo = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`).then(r => r.json()).catch(() => null);
          if (geo?.countryCode) country = geo.countryCode;
        }
      } catch {}
      const [newUser] = await db.insert(users).values({
        login: email,
        password,
        email,
        country,
        ip: userIp,
        fp: fp ?? null,
        role: 'free-trial',
      }).returning();
      return c.json({
        id: newUser.id,
        login: newUser.login,
        role: normalizeRole(newUser.role),
        createdAt: newUser.createdAt ?? null,
      }, 200);
    }
  )

  // ─── EMAIL VERIFICATION: verify code + register ──────────────────────────
  .post('/auth/register-email',
    zValidator('json', z.object({
      email: z.string().email(),
      code: z.string().length(4),
      password: z.string().min(4),
      fp: z.string().optional(),
    })),
    async (c) => {
      await ensureEmailTables();
      const { email, code, password, fp } = c.req.valid('json');
      // cleanup expired codes
      await db.delete(emailCodes).where(lt(emailCodes.expiresAt, Date.now()));
      const record = await db.select().from(emailCodes)
        .where(eq(emailCodes.email, email)).get();
      if (!record) return c.json({ error: 'Код не знайдено або вже використано' }, 400);
      if (record.expiresAt < Date.now()) {
        await db.delete(emailCodes).where(eq(emailCodes.email, email));
        return c.json({ error: 'Код прострочений. Запросіть новий.' }, 400);
      }
      if (record.code !== code) return c.json({ error: 'Невірний код' }, 400);
      // check email still free
      const emailUsed = await db.select().from(users).where(eq(users.email, email)).get();
      if (emailUsed) return c.json({ error: 'Ця пошта вже зареєстрована' }, 409);
      // fingerprint check: block if same device already had a trial
      if (fp) {
        const fpUsed = await db.select().from(users).where(eq(users.fp, fp)).get();
        if (fpUsed) return c.json({ error: 'Пробний період для цього пристрою вже використано' }, 403);
      }
      // detect country by IP
      let country: string | null = null;
      let userIp: string | null = null;
      try {
        const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0].trim() || c.req.header('x-real-ip');
        if (ip && ip !== '127.0.0.1' && ip !== '::1') {
          userIp = ip;
          const geo = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`).then(r => r.json()).catch(() => null);
          if (geo?.countryCode) country = geo.countryCode;
        }
      } catch {}
      // register
      const [newUser] = await db.insert(users).values({
        login: email,
        password,
        email,
        country,
        ip: userIp,
        fp: fp ?? null,
        role: 'free-trial',
      }).returning();
      await db.delete(emailCodes).where(eq(emailCodes.email, email));
      return c.json({
        id: newUser.id,
        login: newUser.login,
        role: normalizeRole(newUser.role),
        createdAt: newUser.createdAt ?? null,
      }, 200);
    }
  )

  .post('/auth/update',
    zValidator('json', z.object({ id: z.number(), login: z.string().min(3).max(32), password: z.string().min(4).optional() })),
    async (c) => {
      const { id, login, password } = c.req.valid('json');
      const user = await db.select().from(users).where(eq(users.id, id)).get();
      if (!user) return c.json({ error: 'Користувача не знайдено' }, 404);
      if (login !== user.login) {
        const existing = await db.select().from(users).where(eq(users.login, login)).get();
        if (existing) return c.json({ error: 'Логін вже зайнятий' }, 409);
      }
      const updateData: { login?: string; password?: string } = {};
      if (login !== user.login) updateData.login = login;
      if (password) updateData.password = password;
      if (Object.keys(updateData).length === 0) {
        return c.json({ error: 'Нічого не змінено' }, 400);
      }
      const [updated] = await db.update(users).set(updateData).where(eq(users.id, id)).returning();
      return c.json({
        id: updated.id,
        login: updated.login,
        role: normalizeRole(updated.role),
        createdAt: updated.createdAt ?? null,
      }, 200);
    }
  )

  .get('/auth/access/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isFinite(id)) return c.json({ hasAccess: false, reason: 'invalid_id' }, 400);
    const user = await db.select().from(users).where(eq(users.id, id)).get();
    if (!user) return c.json({ hasAccess: false, reason: 'not_found' }, 404);

    const role = normalizeRole(user.role);
    if (role === 'admin') return c.json({ hasAccess: true, reason: 'admin', role }, 200);
    if (role === 'paid' || role === 'free') return c.json({ hasAccess: true, reason: 'full', role }, 200);
    if (role === 'no-access') return c.json({ hasAccess: false, reason: 'no_access', role }, 200);

    const row = await ensureSubscriptionRow();
    const plans = parsePlans(row.plansJson);
    const freeWeeks = plans.firstPurchase.freeWeeks ?? DEFAULT_SUBSCRIPTION_SETTINGS.plans.firstPurchase.freeWeeks;
    const createdAtMs = parseDbDate(user.createdAt);
    if (!createdAtMs) {
      return c.json({ hasAccess: true, reason: 'trial', role }, 200);
    }
    const msPerWeek = 7 * 24 * 3600 * 1000;
    const expiresAt = createdAtMs + freeWeeks * msPerWeek;
    if (Date.now() <= expiresAt) {
      return c.json({
        hasAccess: true,
        reason: 'trial',
        role,
        trialEndsAt: new Date(expiresAt).toISOString(),
      }, 200);
    }
    return c.json({
      hasAccess: false,
      reason: 'trial_expired',
      role,
      trialEndedAt: new Date(expiresAt).toISOString(),
    }, 200);
  })

  // ─── ADMIN: list all users ────────────────────────────────────────────────
  .get('/admin/users', async (c) => {
    const asLogin = c.req.query('asLogin');
    const caller = await db.select().from(users).where(eq(users.login, asLogin ?? '')).get();
    if (!caller || caller.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
    try {
      const all = await db.select().from(users).orderBy(desc(users.createdAt)).all();
      return c.json(all, 200);
    } catch {
      // Fallback: column may not exist yet in prod DB — return without it
      const all = await db.run(sql`SELECT id, login, role, email, created_at as createdAt, country, ip FROM users ORDER BY created_at DESC`);
      return c.json(all.rows.map((r: any) => ({
        id: r[0], login: r[1], role: r[2], email: r[3], createdAt: r[4], country: r[5] ?? null, ip: r[6] ?? null,
      })), 200);
    }
  })

  .delete('/admin/users/:id', async (c) => {
    const asLogin = c.req.query('asLogin');
    const caller = await db.select().from(users).where(eq(users.login, asLogin ?? '')).get();
    if (!caller || caller.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
    const id = Number(c.req.param('id'));
    await db.delete(users).where(eq(users.id, id));
    return c.json({ ok: true }, 200);
  })

  .put('/admin/users/:id',
    zValidator('json', z.object({ role: z.enum(['admin', 'paid', 'free-trial', 'free', 'no-access']) })),
    async (c) => {
      const asLogin = c.req.query('asLogin');
      const caller = await db.select().from(users).where(eq(users.login, asLogin ?? '')).get();
      if (!caller || caller.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);

      const id = Number(c.req.param('id'));
      const { role } = c.req.valid('json');

      const [updated] = await db.update(users).set({ role }).where(eq(users.id, id)).returning();
      if (!updated) return c.json({ error: 'User not found' }, 404);

      return c.json({ ok: true, user: updated }, 200);
    }
  )

  // ─── SUBSCRIPTION SETTINGS ──────────────────────────────────────────────────
  .get('/subscription/settings', async (c) => {
    const row = await ensureSubscriptionRow();
    return c.json(mapSubscriptionRow(row), 200);
  })

  .post('/subscription/settings',
    zValidator('json', subscriptionSettingsUpdateSchema),
    async (c) => {
      const { asLogin, buttonText, buttonUrl = '', contactMessage = '', plans } = c.req.valid('json');
      const caller = await db.select().from(users).where(eq(users.login, asLogin)).get();
      if (!caller || caller.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);

      const row = await ensureSubscriptionRow();
      const normalizedText = buttonText.trim() || DEFAULT_SUBSCRIPTION_SETTINGS.buttonText;
      const normalizedUrl = buttonUrl.trim();
      const normalizedMsg = contactMessage.trim();
      const nowIso = new Date().toISOString();

      await db.update(subscriptionSettings).set({
        buttonText: normalizedText,
        buttonUrl: normalizedUrl,
        contactMessage: normalizedMsg,
        plansJson: JSON.stringify(plans),
        updatedAt: nowIso,
      }).where(eq(subscriptionSettings.id, row.id));

      return c.json({
        buttonText: normalizedText,
        buttonUrl: normalizedUrl,
        contactMessage: normalizedMsg,
        plans,
        updatedAt: nowIso,
      }, 200);
    }
  )

  // ─── FIX USERID ─────────────────────────────────────────────────────────────
  .post('/fix-userid', async (c) => {
    // Update all trades to have userId=1 (default user)
    await db.update(backtestTrades).set({ userId: 1 });
    await db.update(liveTrades).set({ userId: 1 });
    return c.json({ ok: true }, 200);
  })

  // ─── STATS ────────────────────────────────────────────────────────────────
  .get('/stats', async (c) => {
    const uid = Number(c.req.query('userId') ?? 0);
    const bt = await db.select().from(backtestTrades).where(eq(backtestTrades.userId, uid)).orderBy(asc(backtestTrades.id)).all();
    const lv = await db.select().from(liveTrades).where(eq(liveTrades.userId, uid)).orderBy(asc(liveTrades.id)).all();

    const calcStats = (trades: typeof bt) => {
      const n = trades.length;
      if (n === 0) return { n: 0, totalR: 0, wr: 0, avgRR: 0, pf: 0, maxDD: 0, sqn: 0, stdDev: 0 };
      const netrArr = trades.map(t => t.netR ?? 0);
      const totalR = Math.round(netrArr.reduce((a, b) => a + b, 0) * 100) / 100;
      const fakes = trades.filter(t => t.result === 'fake').length;
      const tps   = trades.filter(t => t.result === 'tp').length;
      const wrRaw = fakes > 0 ? fakes / n : tps / n || 0;
      const wr = wrRaw;
      const rrs = trades.filter(t => t.rr != null && t.rr > 0).map(t => t.rr!);
      const avgRR = rrs.length ? rrs.reduce((a, b) => a + b, 0) / rrs.length : 0;
      const grossWins = netrArr.filter(r => r > 0).reduce((a, b) => a + b, 0);
      const grossLoss = Math.abs(netrArr.filter(r => r < 0).reduce((a, b) => a + b, 0));
      const pf = grossLoss > 0 ? grossWins / grossLoss : 999;
      let peak = 0, cumul = 0, maxDD = 0;
      for (const r of netrArr) { cumul += r; if (cumul > peak) peak = cumul; if (peak - cumul > maxDD) maxDD = peak - cumul; }
      const mean = totalR / n;
      const variance = netrArr.reduce((a, r) => a + (r - mean) ** 2, 0) / n;
      const std = Math.sqrt(variance);
      const sqn = std > 0 ? (Math.sqrt(n) * mean / std) : 0;
      return {
        n, totalR,
        wr: Math.round(wr * 1000) / 1000,
        avgRR: Math.round(avgRR * 1000) / 1000,
        pf: Math.round(pf * 100) / 100,
        maxDD: Math.round(maxDD * 100) / 100,
        sqn: Math.round(sqn * 100) / 100,
        stdDev: Math.round(std * 1000) / 1000,
      };
    };

    const rollingMetrics = (trades: typeof bt, window = 20) => {
      const wr: number[] = [];
      const avgRR: number[] = [];
      const pf: number[] = [];
      const maxDD: number[] = [];
      const stdDev: number[] = [];

      for (let i = 0; i < trades.length; i++) {
        const start = Math.max(0, i - window + 1);
        const slice = trades.slice(start, i + 1);
        const s = calcStats(slice);
        wr.push(Math.round(s.wr * 1000) / 1000);
        avgRR.push(Math.round(s.avgRR * 1000) / 1000);
        pf.push(Math.min(s.pf, 99));
        maxDD.push(Math.round(s.maxDD * 100) / 100);
        stdDev.push(Math.round(s.stdDev * 1000) / 1000);
      }
      return { wr, avgRR, pf, maxDD, stdDev };
    };

    const btEquity: number[] = [];
    let c2 = 0;
    for (const t of bt) { c2 += t.netR ?? 0; btEquity.push(Math.round(c2 * 100) / 100); }
    const lvEquity: number[] = [];
    let c3 = 0;
    for (const t of lv) { c3 += t.netR ?? 0; lvEquity.push(Math.round(c3 * 100) / 100); }
    const btGrossEquity: number[] = [];
    let cg1 = 0;
    for (const t of bt) { cg1 += t.grossR ?? t.netR ?? 0; btGrossEquity.push(Math.round(cg1 * 100) / 100); }
    const lvGrossEquity: number[] = [];
    let cg2 = 0;
    for (const t of lv) { cg2 += (t as any).grossR ?? t.netR ?? 0; lvGrossEquity.push(Math.round(cg2 * 100) / 100); }

    const btRolling = rollingMetrics(bt, 20);
    const lvRolling = rollingMetrics(lv as any, 10);

    const btNetRArr  = bt.map(t => t.netR ?? 0);
    const btIsTP     = bt.map(t => t.result === 'tp');
    const btRR       = bt.map(t => (t.rr != null && t.rr > 0) ? t.rr : null);
    const N_SIM = 1000;
    // MC simulates "one year forward" — use avg trades/year from bt
    const btYearSet = new Set(bt.map(t => String(t.year)).filter(Boolean));
    const nBtYears = btYearSet.size || 1;
    const avgTradesPerYear = Math.max(10, Math.round(bt.length / nBtYears));
    const N_TRADES_MC = avgTradesPerYear;
    const WIN_BT = 20;

    const rng = (seed: number) => {
      let s = seed;
      return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
    };
    const rand = rng(42);

    type SimRow = { eq: number; wr: number; rr: number; pf: number };
    const byTrade: SimRow[][] = Array.from({ length: N_TRADES_MC }, () => []);
    const simFinals: { totalR: number; maxDD: number; stdDev: number; sqn: number } [] = [];

    for (let si = 0; si < N_SIM; si++) {
      let acc = 0;
      let winCount = 0;
      let rrSum = 0; let rrCount = 0;
      let grossWin = 0; let grossLoss = 0;
      const winBuf: boolean[] = [];
      const rrBuf: (number | null)[] = [];
      const netBuf: number[] = [];
      let simPeak = 0, simCumR = 0, simMaxDD = 0, simSumR = 0, simSumR2 = 0;

      for (let j = 0; j < N_TRADES_MC; j++) {
        const idx = Math.floor(rand() * btNetRArr.length);
        const netR  = btNetRArr[idx];
        const isTP  = btIsTP[idx];
        const rr    = btRR[idx];

        acc += netR;
        simCumR += netR; if (simCumR > simPeak) simPeak = simCumR; if (simPeak - simCumR > simMaxDD) simMaxDD = simPeak - simCumR;
        simSumR += netR; simSumR2 += netR * netR;

        winBuf.push(isTP);
        rrBuf.push(rr);
        netBuf.push(netR);
        if (winBuf.length > WIN_BT) {
          const removed = winBuf.shift()!;
          const removedRR = rrBuf.shift()!;
          const removedNet = netBuf.shift()!;
          if (removed) winCount--;
          if (removedRR != null) { rrSum -= removedRR; rrCount--; }
          if (removedNet > 0) grossWin -= removedNet;
          else if (removedNet < 0) grossLoss -= Math.abs(removedNet);
        }
        if (isTP) winCount++;
        if (rr != null) { rrSum += rr; rrCount++; }
        if (netR > 0) grossWin += netR;
        else if (netR < 0) grossLoss += Math.abs(netR);

        const wLen = winBuf.length;
        const rolWR  = winCount / wLen;
        const rolRR  = rrCount > 0 ? rrSum / rrCount : 0;
        const rolPF  = grossLoss > 0 ? Math.min(grossWin / grossLoss, 99) : (grossWin > 0 ? 99 : 0);

        byTrade[j].push({
          eq:  Math.round(acc * 100) / 100,
          wr:  Math.round(rolWR * 1000) / 1000,
          rr:  Math.round(rolRR * 1000) / 1000,
          pf:  Math.round(rolPF * 100) / 100,
        });
      }
      const simMean = simSumR / N_TRADES_MC;
      const simStd  = Math.sqrt(Math.max(0, simSumR2 / N_TRADES_MC - simMean * simMean));
      simFinals.push({ totalR: acc, maxDD: simMaxDD, stdDev: simStd, sqn: simStd > 0 ? Math.sqrt(N_TRADES_MC) * simMean / simStd : 0 });
    }

    const pctOf = (arr: number[], p: number) => {
      const s = arr.slice().sort((a, b) => a - b);
      return s[Math.floor(s.length * p)] ?? 0;
    };

    const N_PTS = 100;
    const step = Math.max(1, Math.floor(N_TRADES_MC / N_PTS));
    const sampleIndices: number[] = [];
    for (let ti = step - 1; ti < N_TRADES_MC; ti += step) sampleIndices.push(ti);

    const mcMedian: number[] = [];
    const mcp5:    number[] = [];
    const mcp95:   number[] = [];

    const mcWR:   { med: number[]; p5: number[]; p95: number[] } = { med: [], p5: [], p95: [] };
    const mcRR:   { med: number[]; p5: number[]; p95: number[] } = { med: [], p5: [], p95: [] };
    const mcPF:   { med: number[]; p5: number[]; p95: number[] } = { med: [], p5: [], p95: [] };

    for (const ti of sampleIndices) {
      const rows = byTrade[ti];
      const eqArr = rows.map(r => r.eq);
      const wrArr = rows.map(r => r.wr);
      const rrArr = rows.map(r => r.rr);
      const pfArr = rows.map(r => r.pf);

      mcMedian.push(pctOf(eqArr, 0.50));
      mcp5.push(   pctOf(eqArr, 0.05));
      mcp95.push(  pctOf(eqArr, 0.95));

      mcWR.med.push(Math.round(pctOf(wrArr, 0.50) * 1000) / 1000);
      mcWR.p5.push( Math.round(pctOf(wrArr, 0.05) * 1000) / 1000);
      mcWR.p95.push(Math.round(pctOf(wrArr, 0.95) * 1000) / 1000);

      mcRR.med.push(Math.round(pctOf(rrArr, 0.50) * 1000) / 1000);
      mcRR.p5.push( Math.round(pctOf(rrArr, 0.05) * 1000) / 1000);
      mcRR.p95.push(Math.round(pctOf(rrArr, 0.95) * 1000) / 1000);

      mcPF.med.push(Math.round(pctOf(pfArr, 0.50) * 100) / 100);
      mcPF.p5.push( Math.round(pctOf(pfArr, 0.05) * 100) / 100);
      mcPF.p95.push(Math.round(pctOf(pfArr, 0.95) * 100) / 100);
    }

    const mcPathsSample = Array.from({ length: 100 }, (_, i) =>
      sampleIndices.map(ti => byTrade[ti][i * 10]?.eq ?? 0)
    );

    const liveByMonth: Record<string, { n: number; totalR: number; wr: number; avgRR: number }> = {};
    for (const t of lv) {
      const mk = (t.month ?? '').slice(0, 7);
      if (!liveByMonth[mk]) liveByMonth[mk] = { n: 0, totalR: 0, wr: 0, avgRR: 0 };
      liveByMonth[mk].n++;
      liveByMonth[mk].totalR += t.netR ?? 0;
    }
    for (const m of Object.keys(liveByMonth)) {
      const trades = lv.filter(t => (t.month ?? '').slice(0, 7) === m);
      const wins = trades.filter(t => t.result === 'tp').length;
      liveByMonth[m].wr = wins / trades.length || 0;
      liveByMonth[m].totalR = Math.round(liveByMonth[m].totalR * 100) / 100;
      const rrs = trades.filter(t => t.rr != null).map(t => t.rr!);
      liveByMonth[m].avgRR = rrs.length ? Math.round(rrs.reduce((a, b) => a + b, 0) / rrs.length * 1000) / 1000 : 0;
    }

    const instruments = ['EUR', 'GER', 'XAU'];
    const btByInstrument: Record<string, ReturnType<typeof calcStats>> = {};
    for (const inst of instruments) {
      btByInstrument[inst] = calcStats(bt.filter(t => t.instrument === inst));
    }

    const btByInstrumentYear: Record<string, Record<string, ReturnType<typeof calcStats>>> = {};
    for (const inst of instruments) {
      const instTrades = bt.filter(t => t.instrument === inst);
      const years = Array.from(new Set(instTrades.map(t => String(t.year)))).sort();
      btByInstrumentYear[inst] = {};
      for (const yr of years) {
        btByInstrumentYear[inst][yr] = calcStats(instTrades.filter(t => String(t.year) === yr));
      }
    }

    const mcStats = {
      totalR:  Math.round(pctOf(simFinals.map(s => s.totalR),  0.5) * 100) / 100,
      wr:      mcWR.med[mcWR.med.length - 1] ?? 0,
      avgRR:   mcRR.med[mcRR.med.length - 1] ?? 0,
      pf:      mcPF.med[mcPF.med.length - 1] ?? 0,
      maxDD:   Math.round(pctOf(simFinals.map(s => s.maxDD),   0.5) * 100) / 100,
      stdDev:  Math.round(pctOf(simFinals.map(s => s.stdDev),  0.5) * 1000) / 1000,
      sqn:     Math.round(pctOf(simFinals.map(s => s.sqn),     0.5) * 100) / 100,
    };

    // helper to compute max losing streak per simulation
    const maxLosingStreak = (netArr: number[]): number => {
      let max = 0, cur = 0;
      for (const r of netArr) { if (r < 0) { cur++; if (cur > max) max = cur; } else cur = 0; }
      return max;
    };

    // re-run a lightweight pass to collect streaks per sim (use same rng seed=42)
    const rand2 = rng(42);
    const mcStreaks: number[] = [];
    const mcWRfinals: number[] = [];
    for (let si = 0; si < N_SIM; si++) {
      const nets: number[] = [];
      let wins = 0;
      for (let j = 0; j < N_TRADES_MC; j++) {
        const idx = Math.floor(rand2() * btNetRArr.length);
        nets.push(btNetRArr[idx]);
        if (btIsTP[idx]) wins++;
      }
      mcStreaks.push(maxLosingStreak(nets));
      mcWRfinals.push(wins / N_TRADES_MC);
    }

    const box = (arr: number[]) => ({
      p5:  Math.round(pctOf(arr, 0.05) * 100) / 100,
      p25: Math.round(pctOf(arr, 0.25) * 100) / 100,
      med: Math.round(pctOf(arr, 0.50) * 100) / 100,
      p75: Math.round(pctOf(arr, 0.75) * 100) / 100,
      p95: Math.round(pctOf(arr, 0.95) * 100) / 100,
    });

    const mcBoxStats = {
      return:  box(simFinals.map(s => s.totalR)),
      drawdown: box(simFinals.map(s => s.maxDD)),
      sqn:     box(simFinals.map(s => s.sqn)),
      wr:      box(mcWRfinals),
      streak:  box(mcStreaks),
    };

    return c.json({
      btStats: calcStats(bt),
      lvStats: calcStats(lv as any),
      mcStats,
      mcBoxStats,
      btEquity,
      lvEquity,
      btGrossEquity,
      lvGrossEquity,
      btRolling,
      lvRolling,
      mcMedian,
      mcp5,
      mcp95,
      mcWR,
      mcRR,
      mcPF,
      mcPathsSample,
      liveByMonth,
      btByInstrument,
      btByInstrumentYear,
      mcStep: step,
    }, 200);
  })

  // ─── MC FILTER OPTIONS ───────────────────────────────────────────────────
  .get('/mc-filter-options', async (c) => {
    const uid = Number(c.req.query('userId') ?? 0);
    const allBt = await db.select().from(backtestTrades).where(eq(backtestTrades.userId, uid)).all();
    const allLv = await db.select().from(liveTrades).where(eq(liveTrades.userId, uid)).all();

    // BT: group by instrument -> year -> months
    const btTree: Record<string, Record<string, string[]>> = {};
    for (const t of allBt) {
      const inst = (t.instrument ?? 'OTHER').toUpperCase();
      const m = (t.month ?? '').slice(0, 7);
      if (!m) continue;
      const yr = m.slice(0, 4);
      if (!btTree[inst]) btTree[inst] = {};
      if (!btTree[inst][yr]) btTree[inst][yr] = [];
      if (!btTree[inst][yr].includes(m)) btTree[inst][yr].push(m);
    }
    for (const inst of Object.keys(btTree))
      for (const yr of Object.keys(btTree[inst]))
        btTree[inst][yr].sort();

    // Live: group by asset -> year -> months
    const lvTree: Record<string, Record<string, string[]>> = {};
    for (const t of allLv) {
      const asset = (t.asset ?? 'OTHER').toUpperCase();
      const m = (t.month ?? '').slice(0, 7);
      if (!m) continue;
      const yr = m.slice(0, 4);
      if (!lvTree[asset]) lvTree[asset] = {};
      if (!lvTree[asset][yr]) lvTree[asset][yr] = [];
      if (!lvTree[asset][yr].includes(m)) lvTree[asset][yr].push(m);
    }
    for (const asset of Object.keys(lvTree))
      for (const yr of Object.keys(lvTree[asset]))
        lvTree[asset][yr].sort();

    return c.json({ btTree, lvTree });
  })

  // ─── MC CUSTOM FILTER ────────────────────────────────────────────────────
  .get('/mc-custom', async (c) => {
    const uid = Number(c.req.query('userId') ?? 0);
    // New multi-select params (comma-separated)
    const btInstrumentsRaw = c.req.query('btInstruments') ?? ''; // "EUR,GER"
    const btYearsRaw       = c.req.query('btYears')       ?? ''; // "2024,2025"
    const btMonthsRaw      = c.req.query('btMonths')      ?? ''; // "2024-01,2024-02"
    const lvAssetsRaw      = c.req.query('lvAssets')      ?? '';
    const lvYearsRaw       = c.req.query('lvYears')       ?? '';
    const lvMonthsRaw      = c.req.query('lvMonths')      ?? '';

    const split = (s: string) => s ? s.split(',').map(x => x.trim()).filter(Boolean) : [];
    const btInstruments = split(btInstrumentsRaw);
    const btYears       = split(btYearsRaw);
    const btMonthsSel   = split(btMonthsRaw);
    const lvAssets      = split(lvAssetsRaw);
    const lvYears       = split(lvYearsRaw);
    const lvMonthsSel   = split(lvMonthsRaw);

    const allBt = await db.select().from(backtestTrades).where(eq(backtestTrades.userId, uid)).orderBy(asc(backtestTrades.id)).all();
    const allLv = await db.select().from(liveTrades).where(eq(liveTrades.userId, uid)).orderBy(asc(liveTrades.id)).all();

    // Filter BT — months take priority over years (months already encode year)
    let bt = allBt;
    if (btInstruments.length) bt = bt.filter(t => btInstruments.includes((t.instrument ?? '').toUpperCase()));
    if (btMonthsSel.length)   bt = bt.filter(t => btMonthsSel.includes((t.month ?? '').slice(0, 7)));
    else if (btYears.length)  bt = bt.filter(t => btYears.includes(String(t.year)));

    // Filter Live — same priority logic
    let lv = allLv;
    if (lvAssets.length)    lv = lv.filter(t => lvAssets.includes((t.asset ?? 'OTHER').toUpperCase()));
    if (lvMonthsSel.length) lv = lv.filter(t => lvMonthsSel.includes((t.month ?? '').slice(0, 7)));
    else if (lvYears.length) lv = lv.filter(t => lvYears.includes((t.month ?? '').slice(0, 4)));

    // legacy month ranges for old code (not used in new UI but kept for compat)
    const btMonths = Array.from(new Set(allBt.map(t => (t.month ?? '').slice(0, 7)).filter(Boolean))).sort();
    const lvMonths = Array.from(new Set(allLv.map(t => (t.month ?? '').slice(0, 7)).filter(Boolean))).sort();

    const btNetRArr = bt.map(t => t.netR ?? 0);
    const btIsTP    = bt.map(t => t.result === 'tp');
    const btRR      = bt.map(t => (t.rr != null && t.rr > 0) ? t.rr : null);

    const N_SIM = 1000;
    // MC simulates "one year forward" — use avg trades/year from filtered bt
    const btYearSet2 = new Set(bt.map(t => String(t.year)).filter(Boolean));
    const nBtYears2 = btYearSet2.size || 1;
    const avgTradesPerYear2 = Math.max(10, Math.round(bt.length / nBtYears2));
    const N_TRADES_MC = avgTradesPerYear2;
    const WIN_BT = 20;

    const rng = (seed: number) => {
      let s = seed;
      return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
    };
    const rand = rng(42);

    // Identical algorithm to /api/stats — full rolling window simulation
    type SimRow2 = { eq: number };
    const byTrade2: SimRow2[][] = Array.from({ length: N_TRADES_MC }, () => []);
    const simFinals2: { totalR: number }[] = [];

    for (let si = 0; si < N_SIM; si++) {
      let acc = 0;
      let winCount = 0, rrSum = 0, rrCount = 0, grossWin = 0, grossLoss = 0;
      const winBuf: boolean[] = [];
      const rrBuf: (number | null)[] = [];
      const netBuf: number[] = [];
      let simPeak = 0, simCumR = 0, simMaxDD = 0, simSumR = 0, simSumR2 = 0;

      for (let j = 0; j < N_TRADES_MC; j++) {
        if (btNetRArr.length === 0) break;
        const idx   = Math.floor(rand() * btNetRArr.length);
        const netR  = btNetRArr[idx];
        const isTP  = btIsTP[idx];
        const rr    = btRR[idx];

        acc += netR;
        simCumR += netR;
        if (simCumR > simPeak) simPeak = simCumR;
        if (simPeak - simCumR > simMaxDD) simMaxDD = simPeak - simCumR;
        simSumR += netR; simSumR2 += netR * netR;

        winBuf.push(isTP); rrBuf.push(rr); netBuf.push(netR);
        if (winBuf.length > WIN_BT) {
          const rem = winBuf.shift()!; const remRR = rrBuf.shift()!; const remNet = netBuf.shift()!;
          if (rem) winCount--;
          if (remRR != null) { rrSum -= remRR; rrCount--; }
          if (remNet > 0) grossWin -= remNet;
          else if (remNet < 0) grossLoss -= Math.abs(remNet);
        }
        if (isTP) winCount++;
        if (rr != null) { rrSum += rr; rrCount++; }
        if (netR > 0) grossWin += netR;
        else if (netR < 0) grossLoss += Math.abs(netR);

        byTrade2[j].push({ eq: Math.round(acc * 100) / 100 });
      }
      const simMean = simSumR / N_TRADES_MC;
      const simStd  = Math.sqrt(Math.max(0, simSumR2 / N_TRADES_MC - simMean * simMean));
      simFinals2.push({ totalR: acc, maxDD: simMaxDD, stdDev: simStd, sqn: simStd > 0 ? Math.sqrt(N_TRADES_MC) * simMean / simStd : 0 } as any);
    }

    const pctOf2 = (arr: number[], p: number) => {
      const s = arr.slice().sort((a, b) => a - b);
      return s[Math.floor(s.length * p)] ?? 0;
    };

    const N_PTS = 100;
    const step2 = Math.max(1, Math.floor(N_TRADES_MC / N_PTS));
    const sampleIdx2: number[] = [];
    for (let ti = step2 - 1; ti < N_TRADES_MC; ti += step2) sampleIdx2.push(ti);

    const mcMedian: number[] = [];
    const mcp5: number[] = [];
    const mcp95: number[] = [];

    for (const ti of sampleIdx2) {
      const rows = byTrade2[ti] ?? [];
      const eqArr = rows.map(r => r.eq);
      mcMedian.push(pctOf2(eqArr, 0.50));
      mcp5.push(pctOf2(eqArr, 0.05));
      mcp95.push(pctOf2(eqArr, 0.95));
    }

    const mcPathsSample = Array.from({ length: 100 }, (_, i) =>
      sampleIdx2.map(ti => byTrade2[ti][i * 10]?.eq ?? 0)
    );

    const lvEquity: number[] = [];
    let lvCum = 0;
    for (const t of lv) { lvCum += t.netR ?? 0; lvEquity.push(Math.round(lvCum * 100) / 100); }

    // BT actual equity downsampled to match MC points
    const btEquityFull: number[] = [];
    let btCum = 0;
    for (const t of bt) { btCum += t.netR ?? 0; btEquityFull.push(Math.round(btCum * 100) / 100); }
    const btEquity: number[] = sampleIdx2.map(ti => {
      const idx = Math.min(ti, btEquityFull.length - 1);
      return btEquityFull[idx] ?? 0;
    });

    const finals = simFinals2.map((s: any) => s.totalR);
    const ruinPaths   = finals.filter(v => v < 0).length;
    const profitPaths = finals.filter(v => v > 0).length;

    return c.json({
      mcMedian, mcp5, mcp95, mcPathsSample, lvEquity, btEquity,
      btCount: bt.length, lvCount: lv.length,
      ruinPct: N_SIM > 0 ? ruinPaths / N_SIM : 0,
      profitPct: N_SIM > 0 ? profitPaths / N_SIM : 0,
      btMonths, lvMonths,
    });
  })

  // ─── MC STRESS TEST ───────────────────────────────────────────────────────
  .post('/mc-stress',
    zValidator('json', z.object({
      lossAmp: z.number().min(1).max(3).default(1),
      winReduction: z.number().min(0.3).max(1).default(1),
      wrDegradation: z.number().min(0).max(0.5).default(0),
      slippage: z.number().min(0).max(0.5).default(0),
      humanError: z.number().min(0).max(0.2).default(0),
      fatigue: z.number().min(0).max(0.5).default(0),
      badSlipProb: z.number().min(0).max(0.5).default(0),
      badSlipMult: z.number().min(1).max(3).default(1),
      missedWin: z.number().min(0).max(0.5).default(0),
      survivalThreshold: z.number().min(1).max(100).default(20),
    })),
    async (c) => {
      const params = c.req.valid('json');
      const uid = Number(c.req.query('userId') ?? 0);
      const bt = await db.select().from(backtestTrades).where(eq(backtestTrades.userId, uid)).orderBy(asc(backtestTrades.id)).all();
      if (!bt.length) return c.json({ error: 'no data' }, 400);

      const btNetRArr = bt.map(t => t.netR ?? 0);
      const btIsTP    = bt.map(t => t.result === 'tp');
      const btRR      = bt.map(t => (t.rr != null && t.rr > 0) ? t.rr : null);

      const N_SIM = 1000;
      const N_TRADES_MC = bt.length;

      const rng = (seed: number) => {
        let s = seed;
        return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
      };
      const rand = rng(99);

      const pctOf = (arr: number[], p: number) => {
        const s = arr.slice().sort((a, b) => a - b);
        return s[Math.floor(s.length * p)] ?? 0;
      };

      const byTrade: { eq: number }[][] = Array.from({ length: N_TRADES_MC }, () => []);
      let survivedCount = 0;
      const finalEqs: number[] = [];
      const maxDDs: number[] = [];
      const sqns: number[] = [];
      const stressStreaks: number[] = [];
      const stressWRs: number[] = [];

      for (let si = 0; si < N_SIM; si++) {
        const indices: number[] = Array.from({ length: N_TRADES_MC }, () =>
          Math.floor(rand() * btNetRArr.length)
        );

        let acc = 0;
        let peak = 0;
        let maxDD = 0;
        const netArr: number[] = [];

        for (let j = 0; j < N_TRADES_MC; j++) {
          let idx = indices[j];
          let netR = btNetRArr[idx];
          let isTP = btIsTP[idx];

          if (isTP && params.wrDegradation > 0 && rand() < params.wrDegradation) {
            const losers = btNetRArr.map((r, i) => r < 0 ? i : -1).filter(i => i >= 0);
            if (losers.length > 0) { idx = losers[Math.floor(rand() * losers.length)]; netR = btNetRArr[idx]; isTP = false; }
          }

          if (params.humanError > 0 && rand() < params.humanError) {
            netR = -1;
            isTP = false;
          }

          if (!isTP && netR < 0) {
            netR = netR * params.lossAmp;
            if (params.badSlipProb > 0 && rand() < params.badSlipProb) {
              netR = netR * params.badSlipMult;
            }
          }
          if (isTP && netR > 0) {
            netR = netR * params.winReduction;
            if (params.fatigue > 0) netR = netR * (1 - params.fatigue);
            if (params.missedWin > 0 && rand() < params.missedWin) netR = 0;
          }

          netR = netR - params.slippage;

          acc += netR;
          netArr.push(netR);

          if (acc > peak) peak = acc;
          const dd = peak - acc;
          if (dd > maxDD) maxDD = dd;

          byTrade[j].push({ eq: Math.round(acc * 100) / 100 });
        }

        const survived = maxDD < params.survivalThreshold;
        if (survived) survivedCount++;
        finalEqs.push(acc);
        maxDDs.push(maxDD);

        const mean = netArr.reduce((a, b) => a + b, 0) / netArr.length;
        const variance = netArr.reduce((a, r) => a + (r - mean) ** 2, 0) / netArr.length;
        const std = Math.sqrt(variance);
        sqns.push(std > 0 ? Math.sqrt(netArr.length) * mean / std : 0);

        // streak & WR
        let strkMax = 0, strkCur = 0, strkWins = 0;
        for (const r of netArr) { if (r < 0) { strkCur++; if (strkCur > strkMax) strkMax = strkCur; } else { strkCur = 0; } if (r > 0) strkWins++; }
        stressStreaks.push(strkMax);
        stressWRs.push(strkWins / netArr.length);
      }

      const N_PTS = 100;
      const step = Math.max(1, Math.floor(N_TRADES_MC / N_PTS));
      const sampleIndices: number[] = [];
      for (let ti = step - 1; ti < N_TRADES_MC; ti += step) sampleIndices.push(ti);

      const stressMed: number[] = [];
      const stressP5:  number[] = [];
      const stressP95: number[] = [];

      for (const ti of sampleIndices) {
        const eqArr = byTrade[ti].map(r => r.eq);
        stressMed.push(pctOf(eqArr, 0.50));
        stressP5.push( pctOf(eqArr, 0.05));
        stressP95.push(pctOf(eqArr, 0.95));
      }

      const sBox = (arr: number[]) => ({
        p5:  Math.round(pctOf(arr, 0.05) * 100) / 100,
        p25: Math.round(pctOf(arr, 0.25) * 100) / 100,
        med: Math.round(pctOf(arr, 0.50) * 100) / 100,
        p75: Math.round(pctOf(arr, 0.75) * 100) / 100,
        p95: Math.round(pctOf(arr, 0.95) * 100) / 100,
      });

      const stressBoxStats = {
        return:   sBox(finalEqs),
        drawdown: sBox(maxDDs),
        sqn:      sBox(sqns),
        wr:       sBox(stressWRs),
        streak:   sBox(stressStreaks),
      };

      return c.json({
        stressMed,
        stressP5,
        stressP95,
        survivalRate: Math.round(survivedCount / N_SIM * 1000) / 10,
        stressMaxDD: {
          med: Math.round(pctOf(maxDDs, 0.50) * 100) / 100,
          p95: Math.round(pctOf(maxDDs, 0.95) * 100) / 100,
        },
        stressSQN: {
          med: Math.round(pctOf(sqns, 0.50) * 100) / 100,
          p5:  Math.round(pctOf(sqns, 0.05) * 100) / 100,
        },
        stressFinalEq: {
          med: Math.round(pctOf(finalEqs, 0.50) * 100) / 100,
          p5:  Math.round(pctOf(finalEqs, 0.05) * 100) / 100,
          p95: Math.round(pctOf(finalEqs, 0.95) * 100) / 100,
        },
        stressBoxStats,
        step,
      }, 200);
    }
  )

  // ─── MC STRESS FACTOR IMPACT ───────────────────────────────────────────────
  .post('/mc-stress-impact',
    zValidator('json', z.object({
      lossAmp:          z.number().min(1).max(3).default(1),
      winReduction:     z.number().min(0.3).max(1).default(1),
      wrDegradation:    z.number().min(0).max(0.5).default(0),
      slippage:         z.number().min(0).max(0.5).default(0),
      humanError:       z.number().min(0).max(0.2).default(0),
      fatigue:          z.number().min(0).max(0.5).default(0),
      badSlipProb:      z.number().min(0).max(0.5).default(0),
      badSlipMult:      z.number().min(1).max(3).default(1),
      missedWin:        z.number().min(0).max(0.5).default(0),
      survivalThreshold:z.number().min(1).max(100).default(20),
    })),
    async (c) => {
      const params = c.req.valid('json');
      const uid = Number(c.req.query('userId') ?? 0);
      const bt = await db.select().from(backtestTrades).where(eq(backtestTrades.userId, uid)).orderBy(asc(backtestTrades.id)).all();
      if (!bt.length) return c.json({ error: 'no data' }, 400);

      const btNetRArr = bt.map(t => t.netR ?? 0);
      const btIsTP    = bt.map(t => t.result === 'tp');
      const N_TRADES_MC = bt.length;
      const N_SIM_IMPACT = 500;

      const rng = (seed: number) => {
        let s = seed;
        return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
      };

      const pctOf = (arr: number[], p: number) => {
        const s = arr.slice().sort((a, b) => a - b);
        return s[Math.floor(s.length * p)] ?? 0;
      };

      // Run one isolated simulation set and return median of all 5 metrics
      const runSim = (p: typeof params, seed: number) => {
        const rand = rng(seed);
        const finalEqs: number[] = [];
        const maxDDs: number[]   = [];
        const sqns: number[]     = [];
        const wrs: number[]      = [];
        const streaks: number[]  = [];

        for (let si = 0; si < N_SIM_IMPACT; si++) {
          let acc = 0, peak = 0, maxDD = 0;
          const netArr: number[] = [];

          for (let j = 0; j < N_TRADES_MC; j++) {
            let idx = Math.floor(rand() * btNetRArr.length);
            let netR = btNetRArr[idx];
            let isTP = btIsTP[idx];

            if (isTP && p.wrDegradation > 0 && rand() < p.wrDegradation) {
              const losers = btNetRArr.map((r, i) => r < 0 ? i : -1).filter(i => i >= 0);
              if (losers.length > 0) { idx = losers[Math.floor(rand() * losers.length)]; netR = btNetRArr[idx]; isTP = false; }
            }
            if (p.humanError > 0 && rand() < p.humanError) { netR = -1; isTP = false; }
            if (!isTP && netR < 0) {
              netR = netR * p.lossAmp;
              if (p.badSlipProb > 0 && rand() < p.badSlipProb) netR = netR * p.badSlipMult;
            }
            if (isTP && netR > 0) {
              netR = netR * p.winReduction;
              if (p.fatigue > 0) netR = netR * (1 - p.fatigue);
              if (p.missedWin > 0 && rand() < p.missedWin) netR = 0;
            }
            netR = netR - p.slippage;

            acc += netR;
            netArr.push(netR);
            if (acc > peak) peak = acc;
            const dd = peak - acc;
            if (dd > maxDD) maxDD = dd;
          }

          finalEqs.push(acc);
          maxDDs.push(maxDD);

          const mean = netArr.reduce((a, b) => a + b, 0) / netArr.length;
          const variance = netArr.reduce((a, r) => a + (r - mean) ** 2, 0) / netArr.length;
          const std = Math.sqrt(variance);
          sqns.push(std > 0 ? Math.sqrt(netArr.length) * mean / std : 0);

          let strkMax = 0, strkCur = 0, wins = 0;
          for (const r of netArr) { if (r < 0) { strkCur++; if (strkCur > strkMax) strkMax = strkCur; } else strkCur = 0; if (r > 0) wins++; }
          wrs.push(wins / netArr.length);
          streaks.push(strkMax);
        }

        return {
          return:   pctOf(finalEqs, 0.50),
          drawdown: pctOf(maxDDs,   0.50),
          sqn:      pctOf(sqns,     0.50),
          wr:       pctOf(wrs,      0.50),
          streak:   pctOf(streaks,  0.50),
        };
      };

      // Neutral baseline (all factors off)
      const neutral: typeof params = {
        lossAmp: 1, winReduction: 1, wrDegradation: 0, slippage: 0,
        humanError: 0, fatigue: 0, badSlipProb: 0, badSlipMult: 1,
        missedWin: 0, survivalThreshold: params.survivalThreshold,
      };

      const baseline = runSim(neutral, 42);

      // Factors that can be non-neutral
      const FACTORS: { key: string; label: string; apply: (p: typeof params) => Partial<typeof params> }[] = [
        { key: 'lossAmp',       label: 'Loss Amplification', apply: p => ({ lossAmp: p.lossAmp }) },
        { key: 'winReduction',  label: 'Win Reduction',   apply: p => ({ winReduction: p.winReduction }) },
        { key: 'wrDegradation', label: 'WR Degradation',        apply: p => ({ wrDegradation: p.wrDegradation }) },
        { key: 'slippage',      label: 'Slippage',             apply: p => ({ slippage: p.slippage }) },
        { key: 'humanError',    label: 'Human Error',       apply: p => ({ humanError: p.humanError }) },
        { key: 'fatigue',       label: 'Fatigue Decay',                 apply: p => ({ fatigue: p.fatigue }) },
        { key: 'badSlipProb',   label: 'Extreme Slippage',    apply: p => ({ badSlipProb: p.badSlipProb, badSlipMult: p.badSlipMult }) },
        { key: 'missedWin',     label: 'Missed Wins',       apply: p => ({ missedWin: p.missedWin }) },
      ];

      // Only run factors that are actually active (non-neutral)
      const isActive = (key: string): boolean => {
        if (key === 'lossAmp')       return params.lossAmp > 1;
        if (key === 'winReduction')  return params.winReduction < 1;
        if (key === 'wrDegradation') return params.wrDegradation > 0;
        if (key === 'slippage')      return params.slippage > 0;
        if (key === 'humanError')    return params.humanError > 0;
        if (key === 'fatigue')       return params.fatigue > 0;
        if (key === 'badSlipProb')   return params.badSlipProb > 0;
        if (key === 'missedWin')     return params.missedWin > 0;
        return false;
      };

      const activeFactors = FACTORS.filter(f => isActive(f.key));

      // Impact per factor per metric
      type MetricKey = 'return' | 'drawdown' | 'sqn' | 'wr' | 'streak';
      const METRICS: MetricKey[] = ['return', 'drawdown', 'sqn', 'wr', 'streak'];

      const factorResults = activeFactors.map((f, i) => {
        const p = { ...neutral, ...f.apply(params) };
        const res = runSim(p, 100 + i * 17);
        return { key: f.key, label: f.label, res };
      });

      // For each metric: compute |delta| per factor, normalize to %
      const impact: Record<MetricKey, { key: string; label: string; pct: number; delta: number }[]> = {
        return: [], drawdown: [], sqn: [], wr: [], streak: [],
      };

      for (const metric of METRICS) {
        const deltas = factorResults.map(f => ({
          key: f.key,
          label: f.label,
          delta: f.res[metric] - baseline[metric],
        }));
        const totalAbs = deltas.reduce((s, d) => s + Math.abs(d.delta), 0) || 1;
        impact[metric] = deltas
          .map(d => ({ ...d, pct: Math.round(Math.abs(d.delta) / totalAbs * 100) }))
          .filter(d => d.pct > 0)
          .sort((a, b) => b.pct - a.pct);
      }

      return c.json({ impact, baseline }, 200);
    }
  )

  // ─── MC RUN (unified) ────────────────────────────────────────────────────
  .post('/mc-run',
    zValidator('json', z.object({
      // Filter params
      btInstruments:    z.string().optional().default(''),
      btYears:          z.string().optional().default(''),
      btMonths:         z.string().optional().default(''),
      lvAssets:         z.string().optional().default(''),
      lvYears:          z.string().optional().default(''),
      lvMonths:         z.string().optional().default(''),
      // Simulation params
      nSimulations:     z.number().int().min(100).max(20000).default(5000),
      horizon:          z.number().int().min(1).max(2000).optional(),
      stdDevFormula:    z.enum(['n-1', 'n']).default('n-1'),
      tradeCost:        z.number().optional(),
      // Stress params
      lossAmp:          z.number().min(1).max(3).default(1),
      winReduction:     z.number().min(0.3).max(1).default(1),
      wrDegradation:    z.number().min(0).max(0.5).default(0),
      slippage:         z.number().min(0).max(0.5).default(0),
      humanError:       z.number().min(0).max(0.2).default(0),
      fatigue:          z.number().min(0).max(0.5).default(0),
      badSlipProb:      z.number().min(0).max(0.5).default(0),
      badSlipMult:      z.number().min(1).max(3).default(1),
      missedWin:        z.number().min(0).max(0.5).default(0),
      survivalThreshold:z.number().min(1).max(100).default(20),
    })),
    async (c) => {
      const params = c.req.valid('json');
      const uid = Number(c.req.query('userId') ?? 0);

      const split = (s: string) => s ? s.split(',').map(x => x.trim()).filter(Boolean) : [];

      const allBt = await db.select().from(backtestTrades).where(eq(backtestTrades.userId, uid)).orderBy(asc(backtestTrades.id)).all();
      const allLv = await db.select().from(liveTrades).where(eq(liveTrades.userId, uid)).orderBy(asc(liveTrades.id)).all();

      const btInstruments = split(params.btInstruments);
      const btYearsSel    = split(params.btYears);
      const btMonthsSel   = split(params.btMonths);
      const lvAssetsSel   = split(params.lvAssets);
      const lvYearsSel    = split(params.lvYears);
      const lvMonthsSel   = split(params.lvMonths);

      let bt = allBt;
      if (btInstruments.length) bt = bt.filter(t => btInstruments.includes((t.instrument ?? '').toUpperCase()));
      if (btMonthsSel.length)   bt = bt.filter(t => btMonthsSel.includes((t.month ?? '').slice(0, 7)));
      else if (btYearsSel.length) bt = bt.filter(t => btYearsSel.includes(String(t.year)));

      let lv = allLv;
      if (lvAssetsSel.length)    lv = lv.filter(t => lvAssetsSel.includes((t.asset ?? 'OTHER').toUpperCase()));
      if (lvMonthsSel.length)    lv = lv.filter(t => lvMonthsSel.includes((t.month ?? '').slice(0, 7)));
      else if (lvYearsSel.length) lv = lv.filter(t => lvYearsSel.includes((t.month ?? '').slice(0, 4)));

      if (!bt.length) return c.json({ error: 'no BT data' }, 400);

      // Determine avg trade cost from BT if not provided
      const avgCostBt = bt.length > 0
        ? bt.reduce((s, t) => s + ((t.grossR ?? 0) - (t.netR ?? 0)), 0) / bt.length
        : 0;
      const tradeCost = params.tradeCost ?? avgCostBt;

      // Build gross R arrays (reverse apply cost to get gross, then re-apply tradeCost)
      const btGrossArr = bt.map(t => t.grossR ?? (t.netR ?? 0));
      const btIsTP     = bt.map(t => t.result === 'tp');
      const btRR       = bt.map(t => (t.rr != null && t.rr > 0) ? t.rr : null);

      // Horizon = number of trades to simulate
      const N_TRADES_MC = params.horizon ?? bt.length;
      const N_SIM       = params.nSimulations;
      const useN1       = params.stdDevFormula === 'n-1';

      const rng = (seed: number) => {
        let s = seed;
        return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
      };
      const rand = rng(42);

      const pctOf = (arr: number[], p: number) => {
        if (!arr.length) return 0;
        const s = arr.slice().sort((a, b) => a - b);
        const idx = Math.min(Math.floor(s.length * p), s.length - 1);
        return s[idx];
      };

      const hasStress = params.lossAmp > 1 || params.winReduction < 1 || params.wrDegradation > 0
        || params.slippage > 0 || params.humanError > 0 || params.fatigue > 0
        || params.badSlipProb > 0 || params.missedWin > 0;

      // ── per-trade buckets for equity curves ───────────────────────────────
      const N_PTS = Math.min(N_TRADES_MC, 200);
      const sampleStep = Math.max(1, Math.floor(N_TRADES_MC / N_PTS));
      const sampleIdx: number[] = [];
      for (let ti = sampleStep - 1; ti < N_TRADES_MC; ti += sampleStep) sampleIdx.push(ti);

      const byTrade: number[][] = Array.from({ length: sampleIdx.length }, () => []);

      const finalEqs: number[]  = [];
      const maxDDs: number[]    = [];
      const sqns: number[]      = [];
      const wrs: number[]       = [];
      const streaks: number[]   = [];
      let survivedCount = 0;

      // Store up to 50 full paths (sampled)
      const pathSamples: number[][] = [];

      for (let si = 0; si < N_SIM; si++) {
        let acc = 0, peak = 0, maxDD = 0;
        const netArr: number[] = [];

        for (let j = 0; j < N_TRADES_MC; j++) {
          const baseIdx = Math.floor(rand() * btGrossArr.length);
          let grossR = btGrossArr[baseIdx];
          let isTP   = btIsTP[baseIdx];

          // Apply stress factors
          if (hasStress) {
            if (isTP && params.wrDegradation > 0 && rand() < params.wrDegradation) {
              const losers = btGrossArr.map((r, i) => r < 0 ? i : -1).filter(i => i >= 0);
              if (losers.length > 0) {
                const li = losers[Math.floor(rand() * losers.length)];
                grossR = btGrossArr[li]; isTP = false;
              }
            }
            if (params.humanError > 0 && rand() < params.humanError) { grossR = -1; isTP = false; }
            if (!isTP && grossR < 0) {
              grossR = grossR * params.lossAmp;
              if (params.badSlipProb > 0 && rand() < params.badSlipProb) grossR = grossR * params.badSlipMult;
            }
            if (isTP && grossR > 0) {
              grossR = grossR * params.winReduction;
              if (params.fatigue > 0) grossR = grossR * (1 - params.fatigue);
              if (params.missedWin > 0 && rand() < params.missedWin) grossR = 0;
            }
            grossR = grossR - params.slippage;
          }

          // Apply trade cost
          const netR = grossR - tradeCost;

          acc += netR;
          netArr.push(netR);
          if (acc > peak) peak = acc;
          const dd = peak - acc;
          if (dd > maxDD) maxDD = dd;

          // Sample for equity curve
          const sIdx = sampleIdx.indexOf(j);
          if (sIdx >= 0) byTrade[sIdx].push(acc);
        }

        finalEqs.push(acc);
        maxDDs.push(maxDD);

        const mean = netArr.reduce((a, b) => a + b, 0) / netArr.length;
        const denom = useN1 ? Math.max(1, netArr.length - 1) : netArr.length;
        const std = Math.sqrt(netArr.reduce((a, r) => a + (r - mean) ** 2, 0) / denom);
        const sqn = std > 0 ? Math.sqrt(netArr.length) * mean / std : 0;
        sqns.push(sqn);

        let strkMax = 0, strkCur = 0, wins = 0;
        for (const r of netArr) {
          if (r < 0) { strkCur++; if (strkCur > strkMax) strkMax = strkCur; } else strkCur = 0;
          if (r > 0) wins++;
        }
        wrs.push(wins / netArr.length);
        streaks.push(strkMax);
        if (maxDD < params.survivalThreshold) survivedCount++;

        // Store path sample
        if (si < 50) pathSamples.push(sampleIdx.map((ti, si2) => Math.round((byTrade[si2][byTrade[si2].length - 1] ?? 0) * 100) / 100));
      }

      // ── Equity curve percentiles ──────────────────────────────────────────
      const mcMedian: number[] = [];
      const mcp5: number[]     = [];
      const mcp95: number[]    = [];

      for (let i = 0; i < sampleIdx.length; i++) {
        const arr = byTrade[i];
        mcMedian.push(Math.round(pctOf(arr, 0.50) * 100) / 100);
        mcp5.push(Math.round(pctOf(arr, 0.05) * 100) / 100);
        mcp95.push(Math.round(pctOf(arr, 0.95) * 100) / 100);
      }

      // ── SQN distribution (histogram, 20 bins) ────────────────────────────
      const sqnMin = Math.floor(pctOf(sqns, 0.01) * 10) / 10;
      const sqnMax = Math.ceil(pctOf(sqns, 0.99) * 10) / 10;
      const SQN_BINS = 20;
      const sqnBinW = (sqnMax - sqnMin) / SQN_BINS || 0.5;
      const sqnHist: { bin: number; count: number }[] = Array.from({ length: SQN_BINS }, (_, i) => ({
        bin: Math.round((sqnMin + (i + 0.5) * sqnBinW) * 100) / 100,
        count: 0,
      }));
      for (const v of sqns) {
        const i = Math.max(0, Math.min(SQN_BINS - 1, Math.floor((v - sqnMin) / sqnBinW)));
        sqnHist[i].count++;
      }

      // ── Max DD distribution (histogram, 20 bins) ─────────────────────────
      const ddMin  = 0;
      const ddMax  = Math.ceil(pctOf(maxDDs, 0.99) * 10) / 10;
      const DD_BINS = 20;
      const ddBinW = (ddMax - ddMin) / DD_BINS || 1;
      const ddHist: { bin: number; count: number }[] = Array.from({ length: DD_BINS }, (_, i) => ({
        bin: Math.round((ddMin + (i + 0.5) * ddBinW) * 100) / 100,
        count: 0,
      }));
      for (const v of maxDDs) {
        const i = Math.max(0, Math.min(DD_BINS - 1, Math.floor((v - ddMin) / ddBinW)));
        ddHist[i].count++;
      }

      // ── BT + Live equity (gross & net, clipped to horizon) ───────────────
      const btNetEq: number[]   = [];
      const btGrossEq: number[] = [];
      let btNetC = 0, btGrossC = 0;
      for (let i = 0; i < Math.min(bt.length, N_TRADES_MC); i++) {
        btNetC   += bt[i].netR   ?? 0;
        btGrossC += bt[i].grossR ?? (bt[i].netR ?? 0);
        btNetEq.push(Math.round(btNetC * 100) / 100);
        btGrossEq.push(Math.round(btGrossC * 100) / 100);
      }

      const lvNetEq: number[]   = [];
      const lvGrossEq: number[] = [];
      let lvNetC = 0, lvGrossC = 0;
      for (let i = 0; i < Math.min(lv.length, N_TRADES_MC); i++) {
        lvNetC   += lv[i].netR   ?? 0;
        lvGrossC += lv[i].grossR ?? (lv[i].netR ?? 0);
        lvNetEq.push(Math.round(lvNetC * 100) / 100);
        lvGrossEq.push(Math.round(lvGrossC * 100) / 100);
      }

      // ── Factor impact (analytical) ────────────────────────────────────────
      const n   = bt.length;
      const wr  = btIsTP.filter(Boolean).length / Math.max(1, n);
      const avgGrossWin  = btGrossArr.filter(r => r > 0).reduce((s, r) => s + r, 0) / Math.max(1, btGrossArr.filter(r => r > 0).length);
      const avgGrossLoss = btGrossArr.filter(r => r < 0).reduce((s, r) => s + Math.abs(r), 0) / Math.max(1, btGrossArr.filter(r => r < 0).length);
      const N = N_TRADES_MC;

      const factorImpacts = [
        { key: 'lossAmp',       label: 'Loss Amplification', impact: -N * (1 - wr) * avgGrossLoss * (params.lossAmp - 1) },
        { key: 'winReduction',  label: 'Win Reduction',      impact: -N * wr * avgGrossWin * (1 - params.winReduction) },
        { key: 'wrDegradation', label: 'WR Degradation',     impact: -N * wr * params.wrDegradation * (avgGrossWin + avgGrossLoss) },
        { key: 'slippage',      label: 'Slippage',           impact: -N * params.slippage },
        { key: 'humanError',    label: 'Human Error',        impact: -N * wr * params.humanError * (avgGrossWin + avgGrossLoss) },
        { key: 'fatigue',       label: 'Fatigue Decay',      impact: -N * wr * avgGrossWin * params.fatigue },
        { key: 'badSlip',       label: 'Extreme Slippage',   impact: -N * (1 - wr) * avgGrossLoss * params.badSlipProb * (params.badSlipMult - 1) },
        { key: 'missedWin',     label: 'Missed Win',         impact: -N * wr * avgGrossWin * params.missedWin },
      ];

      // ── Box stats helper ──────────────────────────────────────────────────
      const sBox = (arr: number[]) => ({
        p5:  Math.round(pctOf(arr, 0.05) * 100) / 100,
        p25: Math.round(pctOf(arr, 0.25) * 100) / 100,
        med: Math.round(pctOf(arr, 0.50) * 100) / 100,
        p75: Math.round(pctOf(arr, 0.75) * 100) / 100,
        p95: Math.round(pctOf(arr, 0.95) * 100) / 100,
      });

      const boxStats = {
        return:   sBox(finalEqs),
        drawdown: sBox(maxDDs),
        sqn:      sBox(sqns),
        wr:       sBox(wrs),
        streak:   sBox(streaks),
      };

      return c.json({
        // Equity curves
        mcMedian, mcp5, mcp95,
        mcPathsSample: pathSamples.slice(0, 50),
        // BT/Live overlays
        btNetEq, btGrossEq, lvNetEq, lvGrossEq,
        btCount: bt.length, lvCount: lv.length,
        // Distributions
        sqnDistribution: sqnHist,
        ddDistribution: ddHist,
        // Summary stats
        summary: {
          med:  { totalR: Math.round(pctOf(finalEqs, 0.50) * 100) / 100, sqn: Math.round(pctOf(sqns, 0.50) * 100) / 100 },
          p5:   { totalR: Math.round(pctOf(finalEqs, 0.05) * 100) / 100, sqn: Math.round(pctOf(sqns, 0.05) * 100) / 100 },
          p95:  { totalR: Math.round(pctOf(finalEqs, 0.95) * 100) / 100, sqn: Math.round(pctOf(sqns, 0.95) * 100) / 100 },
        },
        // Survival / DD
        survivalRate: Math.round(survivedCount / N_SIM * 1000) / 10,
        ddMed: Math.round(pctOf(maxDDs, 0.50) * 100) / 100,
        ddP5:  Math.round(pctOf(maxDDs, 0.05) * 100) / 100,
        ddProbAboveThreshold: Math.round(maxDDs.filter(d => d > params.survivalThreshold).length / N_SIM * 1000) / 10,
        // Factor impacts
        factorImpacts,
        boxStats,
        // Params echo
        horizon: N_TRADES_MC,
        nSim: N_SIM,
        tradeCost: Math.round(tradeCost * 10000) / 10000,
        avgCostBt: Math.round(avgCostBt * 10000) / 10000,
      }, 200);
    }
  )

  // ─── LIVE TRADES ──────────────────────────────────────────────────────────
  .get('/live-trades', async (c) => {
    const uid = Number(c.req.query('userId') ?? 0);
    const trades = await db.select().from(liveTrades).where(eq(liveTrades.userId, uid)).orderBy(desc(liveTrades.id)).all();
    return c.json(trades, 200);
  })

  .post('/live-trades',
    zValidator('json', z.object({
      date: z.string(),
      asset: z.string().optional(),
      direction: z.string().optional(),
      rr: z.number().optional(),
      session: z.string().optional(),
      result: z.enum(['tp', 'sl', 'be']),
      grossR: z.number(),
      cost: z.number().optional(),
      netR: z.number().optional(),
      profitDollars: z.number().optional(),
      notes: z.string().optional(),
      attachments: z.string().optional(),
    })),
    async (c) => {
      const body = c.req.valid('json');
      const uid = Number(c.req.query('userId') ?? 0);
      const existing = await db.select({ n: liveTrades.tradeNum }).from(liveTrades).where(eq(liveTrades.userId, uid)).all();
      const maxNum = existing.length > 0 ? Math.max(...existing.map(r => r.n ?? 0)) : 0;
      const tradeNum = maxNum + 1;
      const cost = body.cost ?? -0.1;
      const netR = body.netR ?? Math.round((body.grossR + cost) * 100) / 100;
      const [trade] = await db.insert(liveTrades).values({
        userId: uid,
        month: body.date.slice(0, 7),
        tradeNum,
        asset: body.asset,
        direction: body.direction,
        rr: body.rr,
        session: body.session,
        result: body.result,
        grossR: body.grossR,
        cost,
        netR,
        profitDollars: body.profitDollars,
        notes: body.notes,
        attachments: body.attachments,
      }).returning();
      return c.json(trade, 200);
    }
  )

  .put('/live-trades/:id',
    zValidator('json', z.object({
      date: z.string().optional(),
      asset: z.string().optional(),
      direction: z.string().optional(),
      rr: z.number().optional(),
      session: z.string().optional(),
      result: z.enum(['tp', 'sl', 'be']).optional(),
      grossR: z.number().optional(),
      cost: z.number().optional(),
      netR: z.number().optional(),
      profitDollars: z.number().nullable().optional(),
      notes: z.string().nullable().optional(),
      attachments: z.string().nullable().optional(),
    })),
    async (c) => {
      const id = Number(c.req.param('id'));
      const uid = Number(c.req.query('userId') ?? 0);
      const body = c.req.valid('json');
      const existing = await db.select().from(liveTrades).where(eq(liveTrades.id, id)).get();
      if (!existing) return c.json({ error: 'not found' }, 404);
      if (existing.userId !== uid) return c.json({ error: 'Forbidden' }, 403);
      const { date, ...rest } = body;
      const [updated] = await db.update(liveTrades)
        .set({
          ...rest,
          ...(date ? { month: date } : {}),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(liveTrades.id, id)).returning();
      return c.json(updated, 200);
    }
  )

  .delete('/live-trades/:id', async (c) => {
    const id = Number(c.req.param('id'));
    const uid = Number(c.req.query('userId') ?? 0);
    const existing = await db.select().from(liveTrades).where(eq(liveTrades.id, id)).get();
    if (existing && existing.userId !== uid) return c.json({ error: 'Forbidden' }, 403);
    await db.delete(liveTrades).where(eq(liveTrades.id, id));
    return c.json({ ok: true }, 200);
  })

  // ─── BACKTEST TRADES ──────────────────────────────────────────────────────
  .get('/backtest-trades', async (c) => {
    const uid = Number(c.req.query('userId') ?? 0);
    const trades = await db.select().from(backtestTrades)
      .where(eq(backtestTrades.userId, uid))
      .orderBy(asc(backtestTrades.instrument), asc(backtestTrades.year), asc(backtestTrades.month), asc(backtestTrades.tradeNum)).all();
    return c.json(trades, 200);
  })

  // ─── XLSX IMPORT ──────────────────────────────────────────────────────────
  .post('/import-backtest', async (c) => {
    try {
      const uid = Number(c.req.query('userId') ?? 0);
      const formData = await c.req.formData();
      const file = formData.get('file') as File | null;
      if (!file) return c.json({ error: 'no file' }, 400);

      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });

      let totalInserted = 0;

      for (const sheetName of wb.SheetNames) {
        let instrument = 'EUR';
        if (sheetName.toUpperCase().includes('GER')) instrument = 'GER';
        else if (sheetName.toUpperCase().includes('XAU') || sheetName.toUpperCase().includes('GOLD')) instrument = 'XAU';

        if (!sheetName.toLowerCase().includes('raw')) continue;
        if (sheetName.toLowerCase().includes('live')) continue;

        const ws = wb.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const toInsert: typeof backtestTrades.$inferInsert[] = [];

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

          const month = dateRaw.replace(/\s*-\s*/g, '-').trim();
          const year = parseInt(month.slice(0, 4)) || 2025;
          const validCost = Number.isFinite(cost) ? cost : -0.1;
          const netR = Math.round((grossR + validCost) * 100) / 100;

          toInsert.push({
            userId: uid,
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

        if (toInsert.length > 0) {
          for (let i = 0; i < toInsert.length; i += 50) {
            await db.insert(backtestTrades).values(toInsert.slice(i, i + 50));
          }
          totalInserted += toInsert.length;
        }
      }

      return c.json({ ok: true, inserted: totalInserted }, 200);
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  })

  .delete('/backtest-trades/all', async (c) => {
    const uid = Number(c.req.query('userId') ?? 0);
    await db.delete(backtestTrades).where(eq(backtestTrades.userId, uid));
    return c.json({ ok: true }, 200);
  })

  // ── Manual backtest entry ──────────────────────────────────────────────────
  .post('/backtest-manual', async (c) => {
    const uid = Number(c.req.query('userId') ?? 0);
    const body = await c.req.json();
    const { instrument, date, direction, rr, session, result, grossR, cost } = body;
    if (!instrument || !date || !result) return c.json({ error: 'instrument, date and result are required' }, 400);
    const month = String(date).slice(0, 7);
    const year = Number(String(date).slice(0, 4));
    const costVal = cost != null ? Number(cost) : -0.1;
    const grossVal = grossR != null ? Number(grossR) : (result === 'tp' ? Number(rr ?? 1) : result === 'sl' ? -1 : 0);
    const netVal = Math.round((grossVal + costVal) * 100) / 100;
    const existing = await db.select({ n: backtestTrades.tradeNum })
      .from(backtestTrades)
      .where(eq(backtestTrades.userId, uid))
      .all();
    const maxNum = existing.length > 0 ? Math.max(...existing.map(r => r.n ?? 0)) : 0;
    const [trade] = await db.insert(backtestTrades).values({
      userId: uid,
      instrument: String(instrument).toUpperCase(),
      year,
      month,
      tradeNum: maxNum + 1,
      direction: direction ?? null,
      rr: rr != null ? Number(rr) : null,
      session: session ?? null,
      result,
      grossR: grossVal,
      cost: costVal,
      netR: netVal,
    }).returning();
    return c.json({ ok: true, trade }, 200);
  })

  .put('/backtest-trades/:id', async (c) => {
    const uid = Number(c.req.query('userId') ?? 0);
    const id = Number(c.req.param('id'));
    const body = await c.req.json();
    const { instrument, date, direction, rr, session, result, cost } = body;
    const month = date ? String(date).slice(0, 7) : undefined;
    const year = date ? Number(String(date).slice(0, 4)) : undefined;
    const costVal = cost != null ? Number(cost) : -0.1;
    const grossVal = result === 'tp' ? Number(rr ?? 1) : result === 'sl' ? -1 : 0;
    const netVal = Math.round((grossVal + costVal) * 100) / 100;
    const updates: any = {
      ...(instrument && { instrument: String(instrument).toUpperCase() }),
      ...(date && { month, year }),
      ...(direction !== undefined && { direction }),
      ...(rr !== undefined && { rr: rr != null ? Number(rr) : null }),
      ...(session !== undefined && { session }),
      ...(result !== undefined && { result, grossR: grossVal, netR: netVal }),
      cost: costVal,
    };
    await db.update(backtestTrades).set(updates).where(eq(backtestTrades.id, id));
    return c.json({ ok: true }, 200);
  })

  .delete('/backtest-trades/:id', async (c) => {
    const uid = Number(c.req.query('userId') ?? 0);
    const id = Number(c.req.param('id'));
    await db.delete(backtestTrades).where(eq(backtestTrades.id, id));
    return c.json({ ok: true }, 200);
  })

  // ── Bulk backtest entry ────────────────────────────────────────────────────
  .post('/backtest-bulk', async (c) => {
    const uid = Number(c.req.query('userId') ?? 0);
    const body = await c.req.json();
    const { trades } = body as { trades: any[] };
    if (!Array.isArray(trades) || trades.length === 0) return c.json({ error: 'trades array required' }, 400);

    const existing = await db.select({ n: backtestTrades.tradeNum })
      .from(backtestTrades).where(eq(backtestTrades.userId, uid)).all();
    let maxNum = existing.length > 0 ? Math.max(...existing.map(r => r.n ?? 0)) : 0;

    const toInsert = trades.map(t => {
      const month = String(t.date).slice(0, 7);
      const year = Number(String(t.date).slice(0, 4));
      const costVal = t.cost != null ? Number(t.cost) : -0.1;
      const grossVal = t.grossR != null ? Number(t.grossR) : (t.result === 'tp' ? Number(t.rr ?? 1) : t.result === 'sl' ? -1 : 0);
      const netVal = Math.round((grossVal + costVal) * 100) / 100;
      maxNum += 1;
      return {
        userId: uid,
        instrument: String(t.instrument).toUpperCase(),
        year, month,
        tradeNum: maxNum,
        direction: t.direction ?? null,
        rr: t.rr != null ? Number(t.rr) : null,
        session: t.session ?? null,
        result: t.result,
        grossR: grossVal,
        cost: costVal,
        netR: netVal,
      };
    });

    for (let i = 0; i < toInsert.length; i += 50) {
      await db.insert(backtestTrades).values(toInsert.slice(i, i + 50));
    }
    return c.json({ ok: true, inserted: toInsert.length }, 200);
  });

// ─── Economic Calendar (faireconomy.media / ForexFactory data) ───────────────
let newsCache: { ts: number; data: any[] } = { ts: 0, data: [] };

async function fetchNewsData(): Promise<any[]> {
  const urls = [
    'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
    'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
  ];
  const results = await Promise.all(urls.map(async url => {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) return [];
      return res.json();
    } catch { return []; }
  }));
  const all = (results as any[][]).flat();
  // Return all High/Medium — client filters by selected assets
  return all
    .filter((e: any) => e.impact === 'High' || e.impact === 'Medium')
    .map((e: any) => {
      const impact = (e.impact ?? '').toLowerCase();
      return {
        isoDate: e.date ?? '',
        currency: (e.country ?? e.currency ?? '').toUpperCase(),
        impact: impact === 'high' ? 'red' : 'orange',
        title: e.title ?? '',
        forecast: e.forecast ?? null,
        previous: e.previous ?? null,
        actual: e.actual ?? null,
      };
    });
}

app.get('/news', async (c) => {
  const now = Date.now();
  if (now - newsCache.ts < 5 * 60 * 1000 && newsCache.data.length > 0) {
    return c.json(newsCache.data);
  }
  try {
    const data = await fetchNewsData();
    newsCache = { ts: now, data };
    return c.json(data);
  } catch (e) {
    console.error('news error', e);
    if (newsCache.data.length > 0) return c.json(newsCache.data);
    return c.json([]);
  }
});

// ─── Market weekly change ───────────────────────────────────────────────────
let pricesCache: { ts: number; data: any } = { ts: 0, data: null };

async function fetchWeeklyChanges() {
  const symbols: Record<string, string> = {
    EUR: 'EURUSD=X',
    GBP: 'GBPUSD=X',
    XAU: 'GC=F',
    GER: '%5EGDAXI',
    BTC: 'BTC-USD',
    ETH: 'ETH-USD',
    XAG: 'SI=F',
    NAS: '%5EIXIC',
  };
  const results: Record<string, { change: number; current: number; open: number } | null> = {};

  await Promise.all(
    Object.entries(symbols).map(async ([key, sym]) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=7d`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const json = await res.json() as any;
        const result = json?.chart?.result?.[0];
        if (!result) { results[key] = null; return; }

        const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];
        const timestamps: number[] = result.timestamps ?? result.timestamp ?? [];

        const valid = closes.map((c, i) => ({ c, t: timestamps[i] })).filter(x => x.c != null);
        if (valid.length < 2) { results[key] = null; return; }

        const now = new Date();
        const dayOfWeek = now.getUTCDay();
        const daysFromMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysFromMon);

        const weekCandles = valid.filter(x => x.t * 1000 >= monStart);
        if (weekCandles.length === 0) { results[key] = null; return; }

        const weekOpen = weekCandles[0].c;
        const current = valid[valid.length - 1].c;
        const change = ((current - weekOpen) / weekOpen) * 100;

        results[key] = { change: Math.round(change * 100) / 100, current, open: weekOpen };
      } catch {
        results[key] = null;
      }
    })
  );
  return results;
}

app.get('/prices', async (c) => {
  const now = Date.now();
  if (now - pricesCache.ts < 10 * 60 * 1000 && pricesCache.data) {
    return c.json(pricesCache.data);
  }
  try {
    const data = await fetchWeeklyChanges();
    pricesCache = { ts: now, data };
    return c.json(data);
  } catch (e) {
    console.error('prices error', e);
    if (pricesCache.data) return c.json(pricesCache.data);
    return c.json({});
  }
});

// ── AI parse image ────────────────────────────────────────────────────────────
// OCR-based trade table parser (Tesseract)
async function parseTradesWithOCR(imageBuffer: Buffer, mimeType: string): Promise<any[] | null> {
  try {
    const { execSync, spawnSync } = await import('child_process');
    const { writeFileSync, unlinkSync, existsSync } = await import('fs');
    const { tmpdir } = await import('os');
    const { join } = await import('path');

    // write image to tmp
    const ext = mimeType.includes('png') ? 'png' : 'jpg';
    const tmpImg = join(tmpdir(), `tact_ocr_${Date.now()}.${ext}`);
    const tmpPre = join(tmpdir(), `tact_ocr_pre_${Date.now()}.png`);
    const tmpOut = join(tmpdir(), `tact_ocr_out_${Date.now()}`);
    writeFileSync(tmpImg, imageBuffer);

    // preprocess with imagemagick: grayscale, contrast, 2x scale
    spawnSync('convert', [tmpImg, '-colorspace', 'Gray', '-contrast-stretch', '5%x5%', '-resize', '200%', tmpPre]);

    // run tesseract
    const r = spawnSync('tesseract', [tmpPre, tmpOut, '--psm', '6', '-l', 'eng'], { encoding: 'utf8' });
    const outFile = `${tmpOut}.txt`;
    const { readFileSync } = await import('fs');
    if (!existsSync(outFile)) return null;
    const text = readFileSync(outFile, 'utf8');

    // cleanup
    try { unlinkSync(tmpImg); unlinkSync(tmpPre); unlinkSync(outFile); } catch {}

    // parse lines
    const SESSION_MAP: Record<string, string> = {
      overlap: 'overlap', london: 'london', frankfurt: 'frankfurt',
      asia: 'asia', newyork: 'new york', 'new york': 'new york', ny: 'new york',
    };

    const cleanDate = (s: string) => s.replace(/\s*-\s*/g, '-').replace(/[^0-9\-]/g, '');
    // handles: spaces inside numbers (-0, 10 → -0.10), commas as decimal, trailing dots
    const parseNum = (s: string) => parseFloat(s.replace(/\s/g, '').replace(/,/g, '.').replace(/\.+$/, ''));

    const rows: any[] = [];
    for (const rawLine of text.split('\n')) {
      let line = rawLine.trim();
      if (!line) continue;
      // skip summary/header lines
      if (/summary|SUMMARY|WR|Date|Direction|Session/i.test(line) && !/^\d/.test(line)) continue;

      // strip leading garbage before the ID number (e.g. "+ +", "—_", "* ")
      line = line.replace(/^[^0-9]+/, '');
      if (!line) continue;

      // after ID digits + optional dot, strip any non-date garbage (e.g. "21. + +2024" -> "21. 2024")
      line = line.replace(/^(\d+\.?)\s+[^0-9]+/, '$1 ');

      // strip em-dash, en-dash, underscores (OCR noise in session area)
      line = line.replace(/[—–_]/g, '');

      // strip trailing OCR noise chars: ) ] ! ; ' :
      line = line.replace(/[)\]!;':]+(\s|$)/g, ' ').replace(/\s+/g, ' ').trim();

      // match: ID  date(may have spaces around dash)  direction  rr  session(may have leading _)  result  grossR  netR  cost
      // numbers allow internal spaces/commas (OCR noise), parseNum cleans them
      const m = line.match(
        /^(\d+)\.?\s+(\d{4}\s*-\s*\d{2}(?:\s*-\s*\d{2})?|\d{2}\.\d{4}|\d{2}\.\d{2}\.\d{4})\s+(long|short)\s+([\d,\.\s]+?)\s+[_\s]*([\w][\w\s]*?)\s+(tp|sl|be)\s+([-\d,\.\s]+?)\s+([-\d,\.\s]+?)\s+([-\d,\.\s]+)$/i
      );
      if (!m) continue;

      // normalise date
      let rawDate = m[2];
      let date = cleanDate(rawDate);
      if (/^\d{2}\.\d{4}$/.test(rawDate)) {
        const [mo, yr] = rawDate.split('.');
        date = `${yr}-${mo}`;
      } else if (/^\d{2}\.\d{2}\.\d{4}$/.test(rawDate)) {
        const [d, mo, yr] = rawDate.split('.');
        date = `${yr}-${mo}-${d}`;
      }

      // normalise session: strip non-alpha, collapse spaces, map newyork -> new york
      const sessionRaw = m[5].trim().toLowerCase().replace(/[^a-z]/g, '');
      const session = SESSION_MAP[sessionRaw] ?? m[5].trim().toLowerCase().replace(/[^a-z\s]/g, '').trim();

      rows.push({
        date,
        direction: m[3].toLowerCase(),
        rr: parseNum(m[4]),
        session,
        result: m[6].toLowerCase(),
        grossR: parseNum(m[7]),
        cost: parseNum(m[9]),
        instrument: null,
        asset: null,
      });
    }
    return rows.length > 0 ? rows : null;
  } catch {
    return null;
  }
}

app.post('/ai-parse-image', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return c.json({ error: 'no file' }, 400);

    const arrayBuffer = await file.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);
    const mimeType = file.type || 'image/png';

    // 1. Try Tesseract OCR first (free, no API needed)
    const ocrRows = await parseTradesWithOCR(imageBuffer, mimeType);
    if (ocrRows && ocrRows.length > 0) {
      return c.json({ ok: true, rows: ocrRows, method: 'ocr' });
    }

    return c.json({ error: 'Не вдалось розпізнати угоди. Переконайся що скрін містить таблицю з колонками: Date, Direction, RR, Session, Result.' }, 422);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get('/prefs/:key', async (c) => {
  await ensureUserPrefsTable();
  const uid = Number(c.req.query('userId') ?? 0);
  const key = c.req.param('key');
  const row = await db.select({ value: userPrefs.value }).from(userPrefs)
    .where(sql`${userPrefs.userId} = ${uid} AND ${userPrefs.key} = ${key}`)
    .get();
  return c.json({ value: row?.value ?? null });
});

app.put('/prefs/:key', async (c) => {
  await ensureUserPrefsTable();
  const uid = Number(c.req.query('userId') ?? 0);
  const key = c.req.param('key');
  const body = await c.req.json<{ value: string }>();
  await db.run(sql`
    INSERT INTO user_prefs (user_id, key, value, updated_at)
    VALUES (${uid}, ${key}, ${body.value}, datetime('now'))
    ON CONFLICT(user_id, key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')
  `);
  return c.json({ ok: true });
});

export type AppType = typeof app;
export default app;

// ─── AUTO-MIGRATION ON STARTUP ────────────────────────────────────────────────
// Runs idempotently — safe to re-run; errors are silently ignored
(async () => {
  try {
    await Promise.all([
      db.run(sql`ALTER TABLE users ADD COLUMN email TEXT`).catch(() => {}),
      db.run(sql`ALTER TABLE users ADD COLUMN country TEXT`).catch(() => {}),
      db.run(sql`ALTER TABLE users ADD COLUMN ip TEXT`).catch(() => {}),
      db.run(sql`ALTER TABLE users ADD COLUMN fp TEXT`).catch(() => {}),
    ]);
    // Ensure admin user exists with correct role
    const existing = await db.select().from(users).where(eq(users.login, 'whatif')).get();
    if (!existing) {
      await db.insert(users).values({ login: 'whatif', password: '7777', role: 'admin' });
    } else if (existing.role !== 'admin') {
      await db.update(users).set({ role: 'admin' }).where(eq(users.login, 'whatif'));
    }
  } catch (e) {
    console.error('[startup migration] failed:', e);
  }
})();
