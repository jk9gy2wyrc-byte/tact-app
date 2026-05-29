import { Hono } from 'hono';
import { cors } from "hono/cors";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "./database";
import { backtestTrades, liveTrades, users, subscriptionSettings } from "./database/schema";
import { eq, desc, asc, sql } from "drizzle-orm";
import * as XLSX from "xlsx";

const app = new Hono()
  .basePath('api')
  .use(cors({ origin: (origin) => origin ?? "*", credentials: true }))

  // ─── HEALTH ───────────────────────────────────────────────────────────────
  .get('/health', (c) => c.json({ status: 'ok' }, 200))

  // ─── AUTH: SEED ADMIN + LOGIN + REGISTER ──────────────────────────────────
  .get('/auth/seed', async (c) => {
    // Ensure admin user exists
    const existing = await db.select().from(users).where(eq(users.login, 'whatif')).get();
    if (!existing) {
      await db.insert(users).values({ login: 'whatif', password: '7777', role: 'admin' });
    }
    // Ensure subscription settings exist
    const subSettings = await db.select().from(subscriptionSettings).limit(1).get();
    if (!subSettings) {
      await db.insert(subscriptionSettings).values({
        buttonText: 'Contact Us',
        buttonLink: 'mailto:',
      });
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
      return c.json({ id: user.id, login: user.login, role: user.role }, 200);
    }
  )

  .post('/auth/register',
    zValidator('json', z.object({ login: z.string().min(3).max(32), password: z.string().min(4) })),
    async (c) => {
      const { login, password } = c.req.valid('json');
      const existing = await db.select().from(users).where(eq(users.login, login)).get();
      if (existing) return c.json({ error: 'Логін вже зайнятий' }, 409);
      const [newUser] = await db.insert(users).values({ login, password, role: 'user' }).returning();
      return c.json({ id: newUser.id, login: newUser.login, role: 'user' }, 200);
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
      if (Object.keys(updateData).length === 0) return c.json({ error: 'Нічого не змінено' }, 400);
      const [updated] = await db.update(users).set(updateData).where(eq(users.id, id)).returning();
      return c.json({ id: updated.id, login: updated.login, role: updated.role }, 200);
    }
  )

  // ─── ADMIN: list all users ────────────────────────────────────────────────
  .get('/admin/users', async (c) => {
    const asLogin = c.req.query('asLogin');
    const caller = await db.select().from(users).where(eq(users.login, asLogin ?? '')).get();
    if (!caller || caller.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
    const all = await db.select().from(users).orderBy(desc(users.createdAt)).all();
    return c.json(all, 200);
  })

  .delete('/admin/users/:id', async (c) => {
    const asLogin = c.req.query('asLogin');
    const caller = await db.select().from(users).where(eq(users.login, asLogin ?? '')).get();
    if (!caller || caller.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
    const id = Number(c.req.param('id'));
    await db.delete(users).where(eq(users.id, id));
    return c.json({ ok: true }, 200);
  })

  // ─── SUBSCRIPTION SETTINGS ───────────────────────────────────────────────────
  .get('/subscription/settings', async (c) => {
    const settings = await db.select().from(subscriptionSettings).limit(1).get();
    if (!settings) {
      const [created] = await db.insert(subscriptionSettings).values({
        buttonText: 'Contact Us',
        buttonLink: 'mailto:',
      }).returning();
      return c.json(created, 200);
    }
    return c.json(settings, 200);
  })

  .post('/subscription/settings',
    zValidator('json', z.object({ buttonText: z.string().min(1).max(100), buttonLink: z.string().min(1).max(500) })),
    async (c) => {
      const asLogin = c.req.query('asLogin');
      const caller = await db.select().from(users).where(eq(users.login, asLogin ?? '')).get();
      if (!caller || caller.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);

      const { buttonText, buttonLink } = c.req.valid('json');
      const existing = await db.select().from(subscriptionSettings).limit(1).get();
      if (existing) {
        const [updated] = await db.update(subscriptionSettings)
          .set({ buttonText, buttonLink })
          .where(eq(subscriptionSettings.id, existing.id))
          .returning();
        return c.json(updated, 200);
      } else {
        const [created] = await db.insert(subscriptionSettings).values({ buttonText, buttonLink }).returning();
        return c.json(created, 200);
      }
    }
  )

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
      const wins = trades.filter(t => t.result === 'tp').length;
      const wr = n > 0 ? wins / n : 0;
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

    const btStats = calcStats(bt);
    const lvStats = calcStats(lv);

    // Live by month
    const liveByMonth: Record<string, any> = {};
    for (const t of lv) {
      const m = t.month;
      if (!liveByMonth[m]) liveByMonth[m] = [];
      liveByMonth[m].push(t);
    }
    for (const m in liveByMonth) {
      liveByMonth[m] = calcStats(liveByMonth[m]);
    }

    // Backtest by instrument
    const btByInst: Record<string, any> = {};
    for (const t of bt) {
      const i = t.instrument;
      if (!btByInst[i]) btByInst[i] = [];
      btByInst[i].push(t);
    }
    for (const i in btByInst) {
      btByInst[i] = calcStats(btByInst[i]);
    }

    // Backtest by instrument + year
    const btByInstYear: Record<string, Record<string, any>> = {};
    for (const t of bt) {
      const i = t.instrument;
      const y = t.year;
      if (!btByInstYear[i]) btByInstYear[i] = {};
      if (!btByInstYear[i][y]) btByInstYear[i][y] = [];
      btByInstYear[i][y].push(t);
    }
    for (const i in btByInstYear) {
      for (const y in btByInstYear[i]) {
        btByInstYear[i][y] = calcStats(btByInstYear[i][y]);
      }
    }

    return c.json({ btStats, lvStats, liveByMonth, btByInst, btByInstYear }, 200);
  })

  // ─── LIVE TRADES ───────────────────────────────────────────────────────────
  .get('/live-trades', async (c) => {
    const uid = Number(c.req.query('userId') ?? 0);
    const trades = await db.select().from(liveTrades).where(eq(liveTrades.userId, uid)).orderBy(desc(liveTrades.id)).all();
    return c.json(trades, 200);
  })

  .post('/live-trades',
    zValidator('json', z.object({
      month: z.string(),
      tradeNum: z.number(),
      asset: z.string(),
      direction: z.string(),
      rr: z.number().optional(),
      session: z.string().optional(),
      result: z.string(),
      grossR: z.number(),
      cost: z.number().optional(),
      netR: z.number(),
      profitDollars: z.number().optional(),
      notes: z.string().optional(),
      attachments: z.string().optional(),
    })),
    async (c) => {
      const uid = Number(c.req.query('userId') ?? 0);
      const data = c.req.valid('json');
      const [ins] = await db.insert(liveTrades).values({ ...data, userId: uid }).returning();
      return c.json(ins, 200);
    }
  )

  .put('/live-trades/:id',
    zValidator('json', z.object({
      month: z.string().optional(),
      tradeNum: z.number().optional(),
      asset: z.string().optional(),
      direction: z.string().optional(),
      rr: z.number().optional(),
      session: z.string().optional(),
      result: z.string().optional(),
      grossR: z.number().optional(),
      cost: z.number().optional(),
      netR: z.number().optional(),
      profitDollars: z.number().optional(),
      notes: z.string().optional(),
      attachments: z.string().optional(),
    })),
    async (c) => {
      const id = Number(c.req.param('id'));
      const data = c.req.valid('json');
      const [updated] = await db.update(liveTrades).set(data).where(eq(liveTrades.id, id)).returning();
      return c.json(updated, 200);
    }
  )

  .delete('/live-trades/:id', async (c) => {
    const id = Number(c.req.param('id'));
    await db.delete(liveTrades).where(eq(liveTrades.id, id));
    return c.json({ ok: true }, 200);
  })

  // ─── BACKTEST TRADES ────────────────────────────────────────────────────────
  .get('/backtest-trades', async (c) => {
    const uid = Number(c.req.query('userId') ?? 0);
    const trades = await db.select().from(backtestTrades).where(eq(backtestTrades.userId, uid)).orderBy(asc(backtestTrades.id)).all();
    return c.json(trades, 200);
  })

  .post('/backtest-trades',
    zValidator('json', z.object({
      instrument: z.string(),
      year: z.number(),
      month: z.string(),
      tradeNum: z.number(),
      direction: z.string().optional(),
      rr: z.number().optional(),
      session: z.string().optional(),
      result: z.string().optional(),
      grossR: z.number().optional(),
      cost: z.number().optional(),
      netR: z.number().optional(),
    })),
    async (c) => {
      const uid = Number(c.req.query('userId') ?? 0);
      const data = c.req.valid('json');
      const [ins] = await db.insert(backtestTrades).values({ ...data, userId: uid }).returning();
      return c.json(ins, 200);
    }
  )

  .delete('/backtest-trades', async (c) => {
    const uid = Number(c.req.query('userId') ?? 0);
    await db.delete(backtestTrades).where(eq(backtestTrades.userId, uid));
    return c.json({ ok: true }, 200);
  })

  // ─── XLSX UPLOAD ────────────────────────────────────────────────────────────
  .post('/upload/xlsx', async (c) => {
    const uid = Number(c.req.query('userId') ?? 0);
    const body = await c.req.parseBody();
    const file = body.file as File;
    if (!file) return c.json({ error: 'No file' }, 400);

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any>(sheet);

    const trades = rows.map(r => ({
      userId: uid,
      instrument: r.Instrument || 'EUR',
      year: Number(r.Year) || new Date().getFullYear(),
      month: r.Month || new Date().toISOString().slice(0, 7),
      tradeNum: Number(r.TradeNum) || 0,
      direction: r.Direction,
      rr: r.RR ? Number(r.RR) : null,
      session: r.Session,
      result: r.Result,
      grossR: r.GrossR ? Number(r.GrossR) : null,
      cost: r.Cost ? Number(r.Cost) : null,
      netR: r.NetR ? Number(r.NetR) : null,
    }));

    await db.delete(backtestTrades).where(eq(backtestTrades.userId, uid));
    await db.insert(backtestTrades).values(trades);
    return c.json({ ok: true, inserted: trades.length }, 200);
  })

  // ─── NEWS ─────────────────────────────────────────────────────────────────
  .get('/news', async (c) => {
    const r = await fetch('https://www.forexfactory.com/calendar.php?csv=1');
    const text = await r.text();
    const lines = text.split('\n').slice(1);
    const news = lines
      .map(l => l.split(','))
      .filter(cols => cols.length >= 5)
      .map(cols => ({
        date: cols[0],
        time: cols[1],
        currency: cols[2],
        impact: cols[3],
        title: cols[4],
      }));
    return c.json(news, 200);
  })

  // ─── PRICES ────────────────────────────────────────────────────────────────
  .get('/prices', async (c) => {
    const EUR = await fetch('https://api.exchangerate-api.com/v4/latest/USD').then(r => r.json()).then(d => ({ change: ((d.rates.EUR - 1) / 1) * 100 }));
    const GBP = await fetch('https://api.exchangerate-api.com/v4/latest/USD').then(r => r.json()).then(d => ({ change: ((d.rates.GBP - 1) / 1) * 100 }));
    const XAU = await fetch('https://api.exchangerate-api.com/v4/latest/USD').then(r => r.json()).then(d => ({ change: ((d.rates.XAU - 1) / 1) * 100 }));
    const GER = await fetch('https://api.exchangerate-api.com/v4/latest/USD').then(r => r.json()).then(d => ({ change: ((d.rates.EUR - 1) / 1) * 100 }));
    return c.json({ EUR, GBP, XAU, GER }, 200);
  })

  // ─── MC STRESS ─────────────────────────────────────────────────────────────
  .post('/mc-stress',
    zValidator('json', z.object({
      lossAmp: z.number().optional(),
      winReduction: z.number().optional(),
      wrDegradation: z.number().optional(),
      slippage: z.number().optional(),
      humanError: z.number().optional(),
      fatigue: z.number().optional(),
      badSlipProb: z.number().optional(),
      badSlipMult: z.number().optional(),
      missedWin: z.number().optional(),
      survivalThreshold: z.number().optional(),
    })),
    async (c) => {
      const uid = Number(c.req.query('userId') ?? 0);
      const bt = await db.select().from(backtestTrades).where(eq(backtestTrades.userId, uid)).orderBy(asc(backtestTrades.id)).all();
      const lv = await db.select().from(liveTrades).where(eq(liveTrades.userId, uid)).orderBy(asc(liveTrades.id)).all();

      const params = c.req.valid('json');
      const lossAmp = params.lossAmp ?? 1;
      const winReduction = params.winReduction ?? 1;
      const wrDegradation = params.wrDegradation ?? 0;
      const slippage = params.slippage ?? 0;
      const humanError = params.humanError ?? 0;
      const fatigue = params.fatigue ?? 0;
      const badSlipProb = params.badSlipProb ?? 0;
      const badSlipMult = params.badSlipMult ?? 1;
      const missedWin = params.missedWin ?? 0;
      const survivalThreshold = params.survivalThreshold ?? 0;

      const N_TRADES_MC = 1000;
      const N_SIMS = 200;

      type SimRow = { eq: number; wr: number; rr: number; pf: number };
      const byTrade: SimRow[][] = Array.from({ length: N_TRADES_MC }, () => []);
      const simFinals: { totalR: number; maxDD: number; stdDev: number; sqn: number } [] = [];

      for (let s = 0; s < N_SIMS; s++) {
        let acc = 0;
        const netBuf: number[] = [];
        let simPeak = 0, simCumR = 0, simMaxDD = 0, simSumR = 0, simSumR2 = 0;

        for (let j = 0; j < N_TRADES_MC; j++) {
          const t = bt[j % bt.length];
          if (!t) break;

          let netR = t.netR ?? 0;
          let isWin = netR > 0;

          // Apply stress factors
          if (isWin) {
            netR *= winReduction;
            if (Math.random() < missedWin) netR = 0;
          } else {
            netR *= lossAmp;
          }

          if (Math.random() < badSlipProb) {
            netR *= badSlipMult;
          }

          if (Math.random() < wrDegradation) {
            isWin = !isWin;
            netR = -Math.abs(netR);
          }

          netR -= slippage;

          if (Math.random() < humanError) {
            netR = -Math.abs(netR);
          }

          if (Math.random() < fatigue && j > 50) {
            netR *= 0.5;
          }

          acc += netR;
          simCumR += netR; if (simCumR > simPeak) simPeak = simCumR; if (simPeak - simCumR > simMaxDD) simMaxDD = simPeak - simCumR;
          simSumR += netR; simSumR2 += netR * netR;

          if (acc < -survivalThreshold) {
            for (let k = j; k < N_TRADES_MC; k++) {
              byTrade[k].push({ eq: acc, wr: 0, rr: 0, pf: 0 });
            }
            break;
          }

          netBuf.push(netR);
          const wins = netBuf.filter(x => x > 0).length;
          const rolWR = wins / netBuf.length;
          const rolRR = netBuf.length > 0 ? netBuf.reduce((a, b) => a + b, 0) / netBuf.length : 0;
          const rolPF = netBuf.filter(x => x > 0).reduce((a, b) => a + b, 0) / Math.abs(netBuf.filter(x => x < 0).reduce((a, b) => a + b, 0) || 1);

          byTrade[j].push({
            eq: Math.round(acc * 100) / 100,
            wr: Math.round(rolWR * 1000) / 1000,
            rr: Math.round(rolRR * 1000) / 1000,
            pf: Math.round(rolPF * 100) / 100,
          });
        }
        const simMean = simSumR / N_TRADES_MC;
        const simStd = Math.sqrt(Math.max(0, simSumR2 / N_TRADES_MC - simMean * simMean));
        simFinals.push({ totalR: acc, maxDD: simMaxDD, stdDev: simStd, sqn: simStd > 0 ? Math.sqrt(N_TRADES_MC) * simMean / simStd : 0 });
      }

      const pctOf = (arr: number[], p: number) => {
        const sorted = [...arr].sort((a, b) => a - b);
        const idx = Math.floor(p * (sorted.length - 1));
        return sorted[idx];
      };

      const byTradePct = byTrade.map((rows, i) => {
        if (rows.length === 0) return { eq: 0, wr: 0, rr: 0, pf: 0 };
        const eqs = rows.map(r => r.eq);
        const wrs = rows.map(r => r.wr);
        const rrs = rows.map(r => r.rr);
        const pfs = rows.map(r => r.pf);
        return {
          eq: pctOf(eqs, 0.5),
          wr: pctOf(wrs, 0.5),
          rr: pctOf(rrs, 0.5),
          pf: pctOf(pfs, 0.5),
        };
      });

      const mcStats = {
        totalR: Math.round(pctOf(simFinals.map(s => s.totalR), 0.5) * 100) / 100,
        wr: byTradePct[byTradePct.length - 1]?.wr ?? 0,
        avgRR: byTradePct[byTradePct.length - 1]?.rr ?? 0,
        pf: byTradePct[byTradePct.length - 1]?.pf ?? 0,
        maxDD: Math.round(pctOf(simFinals.map(s => s.maxDD), 0.5) * 100) / 100,
        stdDev: Math.round(pctOf(simFinals.map(s => s.stdDev), 0.5) * 1000) / 1000,
        sqn: Math.round(pctOf(simFinals.map(s => s.sqn), 0.5) * 100) / 100,
      };

      return c.json({
        btStats: calcStats(bt),
        lvStats: calcStats(lv as any),
        mcStats,
        byTrade: byTradePct,
      }, 200);
    }
  );

export default app;
