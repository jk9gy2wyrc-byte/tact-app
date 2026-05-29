import { Hono } from 'hono';
import { cors } from "hono/cors";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "./database";
import { backtestTrades, liveTrades, users } from "./database/schema";
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

  // ─── STATS ────────────────────────────────────────────────────────────────
  .get('/stats', async (c) => {
    // Temporarily return all data regardless of userId for testing
    const bt = await db.select().from(backtestTrades).orderBy(asc(backtestTrades.id)).all();
    const lv = await db.select().from(liveTrades).orderBy(asc(liveTrades.id)).all();

    const calcStats = (trades: typeof bt) => {
      const n = trades.length;
      if (n === 0) return { n: 0, totalR: 0, wr: 0, avgRR: 0, pf: 0, maxDD: 0, sqn: 0, stdDev: 0 };
      const netrArr = trades.map(t => t.netR ?? 0);
      const totalR = Math.round(netrArr.reduce((a, b) => a + b, 0) * 100) / 100;
      const fakes = trades.filter(t => t.result === 'fake').length;
      const tps   = trades.filter(t => t.result === 'tp').length;
      // BT WR = fake / total; LV WR = tp / total (live has no 'fake' result type)
      const wrRaw = fakes > 0 ? fakes / n : tps / n || 0;
      const wr = wrRaw;
      // avgRR: only trades with actual RR set (TP trades typically)
      const rrs = trades.filter(t => t.rr != null && t.rr > 0).map(t => t.rr!);
      const avgRR = rrs.length ? rrs.reduce((a, b) => a + b, 0) / rrs.length : 0;
      const grossWins = netrArr.filter(r => r > 0).reduce((a, b) => a + b, 0);
      const grossLoss = Math.abs(netrArr.filter(r => r < 0).reduce((a, b) => a + b, 0));
      const pf = grossLoss > 0 ? grossWins / grossLoss : 999;
      // max drawdown
      let peak = 0, cumul = 0, maxDD = 0;
      for (const r of netrArr) { cumul += r; if (cumul > peak) peak = cumul; if (peak - cumul > maxDD) maxDD = peak - cumul; }
      // SQN + stddev
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

    // Rolling series helper (window=20)
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
        pf.push(Math.min(s.pf, 99)); // cap at 99 for charting
        maxDD.push(Math.round(s.maxDD * 100) / 100);
        stdDev.push(Math.round(s.stdDev * 1000) / 1000);
      }
      return { wr, avgRR, pf, maxDD, stdDev };
    };

    // equity curves
    const btEquity: number[] = [];
    let c2 = 0;
    for (const t of bt) { c2 += t.netR ?? 0; btEquity.push(Math.round(c2 * 100) / 100); }
    const lvEquity: number[] = [];
    let c3 = 0;
    for (const t of lv) { c3 += t.netR ?? 0; lvEquity.push(Math.round(c3 * 100) / 100); }

    // Rolling metrics
    const btRolling = rollingMetrics(bt, 20);
    const lvRolling = rollingMetrics(lv as any, 10);

    // ── MC simulation (1000 sims) ─────────────────────────────────────────────
    const btNetRArr  = bt.map(t => t.netR ?? 0);
    const btIsTP     = bt.map(t => t.result === 'tp');
    const btRR       = bt.map(t => (t.rr != null && t.rr > 0) ? t.rr : null);
    const N_SIM = 1000;
    const N_TRADES_MC = bt.length || 50;
    const WIN_BT = 20; // rolling window same as btRolling

    const rng = (seed: number) => {
      let s = seed;
      return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
    };
    const rand = rng(42);

    // Per-simulation rolling series storage: [sim][trade] -> value
    // We store equity + rolling WR + rolling avgRR + rolling PF per sim
    // Then at each trade index compute p5/p50/p95 across sims

    // To save memory: compute percentiles on-the-fly per trade index
    // Store transposed: mcEquityByTrade[tradeIdx] = [sim0val, sim1val, ...]
    // But 1000 sims x 273 trades = 273k numbers — fine

    type SimRow = { eq: number; wr: number; rr: number; pf: number };
    // [tradeIdx][simIdx]
    const byTrade: SimRow[][] = Array.from({ length: N_TRADES_MC }, () => []);
    const simFinals: { totalR: number; maxDD: number; stdDev: number; sqn: number } [] = [];

    for (let si = 0; si < N_SIM; si++) {
      let acc = 0;
      let winCount = 0;
      let rrSum = 0; let rrCount = 0;
      let grossWin = 0; let grossLoss = 0;
      // ring buffers for rolling window
      const winBuf: boolean[] = [];
      const rrBuf: (number | null)[] = [];
      const netBuf: number[] = [];
      // full-sim tracking for mcStats
      let simPeak = 0, simCumR = 0, simMaxDD = 0, simSumR = 0, simSumR2 = 0;

      for (let j = 0; j < N_TRADES_MC; j++) {
        const idx = Math.floor(rand() * btNetRArr.length);
        const netR  = btNetRArr[idx];
        const isTP  = btIsTP[idx];
        const rr    = btRR[idx];

        acc += netR;
        simCumR += netR; if (simCumR > simPeak) simPeak = simCumR; if (simPeak - simCumR > simMaxDD) simMaxDD = simPeak - simCumR;
        simSumR += netR; simSumR2 += netR * netR;

        // maintain rolling window
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

    // Percentile helper
    const pctOf = (arr: number[], p: number) => {
      const s = arr.slice().sort((a, b) => a - b);
      return s[Math.floor(s.length * p)] ?? 0;
    };

    // Downsample to N_PTS points
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

    // Sample 100 equity paths for MC page display (every 10th sim)
    const mcPathsSample = Array.from({ length: 100 }, (_, i) =>
      byTrade.map(tradeRows => tradeRows[i * 10]?.eq ?? 0)
    );

    // Monthly breakdown for live
    const liveByMonth: Record<string, { n: number; totalR: number; wr: number; avgRR: number }> = {};
    for (const t of lv) {
      const mk = (t.month ?? '').slice(0, 7); // always YYYY-MM
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

    // BT by instrument
    const instruments = ['EUR', 'GER', 'XAU'];
    const btByInstrument: Record<string, ReturnType<typeof calcStats>> = {};
    for (const inst of instruments) {
      btByInstrument[inst] = calcStats(bt.filter(t => t.instrument === inst));
    }

    // BT by instrument + year
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

    return c.json({
      btStats: calcStats(bt),
      lvStats: calcStats(lv as any),
      mcStats,
      btEquity,
      lvEquity,
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
      const rand = rng(99); // different seed from base MC

      const pctOf = (arr: number[], p: number) => {
        const s = arr.slice().sort((a, b) => a - b);
        return s[Math.floor(s.length * p)] ?? 0;
      };

      // Per-tradeIdx accumulators
      const byTrade: { eq: number }[][] = Array.from({ length: N_TRADES_MC }, () => []);
      let survivedCount = 0;
      const finalEqs: number[] = [];
      const maxDDs: number[] = [];
      const sqns: number[] = [];

      for (let si = 0; si < N_SIM; si++) {
        // Build stressed trade sequence using clustering if needed
        // Step 1: pick random indices (same sampling as base MC)
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

          // WR Degradation: flip TP to SL
          if (isTP && params.wrDegradation > 0 && rand() < params.wrDegradation) {
            const losers = btNetRArr.map((r, i) => r < 0 ? i : -1).filter(i => i >= 0);
            if (losers.length > 0) { idx = losers[Math.floor(rand() * losers.length)]; netR = btNetRArr[idx]; isTP = false; }
          }

          // Human Error: trade becomes -1R (tilt, forgot SL, technical mistake)
          if (params.humanError > 0 && rand() < params.humanError) {
            netR = -1;
            isTP = false;
          }

          // Apply market modifiers
          if (!isTP && netR < 0) {
            netR = netR * params.lossAmp;
            // Bad Slip: gap/news spike worsens the loss
            if (params.badSlipProb > 0 && rand() < params.badSlipProb) {
              netR = netR * params.badSlipMult;
            }
          }
          if (isTP && netR > 0) {
            netR = netR * params.winReduction;
            // Fatigue Decay: reduce win by fatigue fraction (fear of reversal, early exit)
            if (params.fatigue > 0) netR = netR * (1 - params.fatigue);
            // Missed Win: win becomes 0R (missed entry, fear after loss)
            if (params.missedWin > 0 && rand() < params.missedWin) netR = 0;
          }

          // Slippage: fixed cost per trade
          netR = netR - params.slippage;

          acc += netR;
          netArr.push(netR);

          // track drawdown
          if (acc > peak) peak = acc;
          const dd = peak - acc;
          if (dd > maxDD) maxDD = dd;

          byTrade[j].push({ eq: Math.round(acc * 100) / 100 });
        }

        // Survival check
        const survived = maxDD < params.survivalThreshold;
        if (survived) survivedCount++;
        finalEqs.push(acc);
        maxDDs.push(maxDD);

        // SQN for this sim
        const mean = netArr.reduce((a, b) => a + b, 0) / netArr.length;
        const variance = netArr.reduce((a, r) => a + (r - mean) ** 2, 0) / netArr.length;
        const std = Math.sqrt(variance);
        sqns.push(std > 0 ? Math.sqrt(netArr.length) * mean / std : 0);
      }

      // Downsample to 100 pts
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

      return c.json({
        stressMed,
        stressP5,
        stressP95,
        survivalRate: Math.round(survivedCount / N_SIM * 1000) / 10, // %
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
        step,
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
      date: z.string(), // YYYY-MM-DD
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
      attachments: z.string().optional(), // JSON string
    })),
    async (c) => {
      const body = c.req.valid('json');
      const uid = Number(c.req.query('userId') ?? 0);
      // auto tradeNum = max existing + 1
      const existing = await db.select({ n: liveTrades.tradeNum }).from(liveTrades).where(eq(liveTrades.userId, uid)).all();
      const maxNum = existing.length > 0 ? Math.max(...existing.map(r => r.n ?? 0)) : 0;
      const tradeNum = maxNum + 1;
      const cost = body.cost ?? -0.1;
      const netR = body.netR ?? Math.round((body.grossR + cost) * 100) / 100;
      const [trade] = await db.insert(liveTrades).values({
        userId: uid,
        month: body.date.slice(0, 7), // store as YYYY-MM always
        tradeNum,
        asset: body.asset,
        direction: body.direction,
        rr: body.rr,
        session: body.session,
        result: body.result,
        grossR: body.grossR,
        cost
