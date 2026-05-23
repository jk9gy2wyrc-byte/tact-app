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

    for (let si = 0; si < N_SIM; si++) {
      let acc = 0;
      let winCount = 0;
      let rrSum = 0; let rrCount = 0;
      let grossWin = 0; let grossLoss = 0;
      // ring buffers for rolling window
      const winBuf: boolean[] = [];
      const rrBuf: (number | null)[] = [];
      const netBuf: number[] = [];

      for (let j = 0; j < N_TRADES_MC; j++) {
        const idx = Math.floor(rand() * btNetRArr.length);
        const netR  = btNetRArr[idx];
        const isTP  = btIsTP[idx];
        const rr    = btRR[idx];

        acc += netR;

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



    return c.json({
      btStats: calcStats(bt),
      lvStats: calcStats(lv as any),
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
      // 1. Loss Amplification: multiply losing trades by factor (1.0 = no change, 1.2 = losses 20% bigger)
      lossAmp: z.number().min(1).max(3).default(1),
      // 2. Win Reduction: multiply winning trades by factor (1.0 = no change, 0.8 = wins 20% smaller)
      winReduction: z.number().min(0.3).max(1).default(1),
      // 3. WR Degradation: % of TP trades randomly flipped to SL (0 = none, 0.15 = flip 15% of wins)
      wrDegradation: z.number().min(0).max(0.5).default(0),
      // 4. Loss Clustering: probability of consecutive losses forming clusters (0 = none, 1 = max)
      lossClustering: z.number().min(0).max(1).default(0),
      clusterSize: z.number().min(2).max(10).default(3),
      // 5. Regime Shift: reduce WR and avgRR simultaneously (0 = none, 1 = full shift)
      regimeShiftWR: z.number().min(0).max(0.3).default(0),   // reduce WR by this fraction (e.g. 0.1 = -10pp)
      regimeShiftRR: z.number().min(0).max(0.5).default(0),   // reduce avgRR by this fraction (e.g. 0.2 = avgRR * 0.8)
      // 6. Execution Slippage: add fixed cost per trade in R (0 = none, 0.05 = -0.05R per trade)
      slippage: z.number().min(0).max(0.5).default(0),
      // Survival threshold: what % drawdown is "blown" (default 20R)
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

        // Clustering state
        let clusterRemaining = 0;

        for (let j = 0; j < N_TRADES_MC; j++) {
          let idx = indices[j];
          let netR = btNetRArr[idx];
          let isTP = btIsTP[idx];

          // 4. Loss Clustering: if in a cluster, force pick a losing trade
          if (params.lossClustering > 0 && clusterRemaining > 0) {
            // find a losing trade index
            const losingIndices = btNetRArr.map((r, i) => r < 0 ? i : -1).filter(i => i >= 0);
            if (losingIndices.length > 0) {
              idx = losingIndices[Math.floor(rand() * losingIndices.length)];
              netR = btNetRArr[idx];
              isTP = false;
            }
            clusterRemaining--;
          }

          // 3. WR Degradation: randomly flip a TP to SL
          if (isTP && params.wrDegradation > 0 && rand() < params.wrDegradation) {
            // flip to a random loss
            const losingIndices = btNetRArr.map((r, i) => r < 0 ? i : -1).filter(i => i >= 0);
            if (losingIndices.length > 0) {
              idx = losingIndices[Math.floor(rand() * losingIndices.length)];
              netR = btNetRArr[idx];
              isTP = false;
            }
          }

          // 5. Regime Shift: flip additional WR% of TPs to losses
          if (isTP && params.regimeShiftWR > 0 && rand() < params.regimeShiftWR) {
            const losingIndices = btNetRArr.map((r, i) => r < 0 ? i : -1).filter(i => i >= 0);
            if (losingIndices.length > 0) {
              idx = losingIndices[Math.floor(rand() * losingIndices.length)];
              netR = btNetRArr[idx];
              isTP = false;
            }
          }

          // Apply stress modifiers to net R
          if (!isTP && netR < 0) {
            // 1. Loss Amplification
            netR = netR * params.lossAmp;
          }
          if (isTP && netR > 0) {
            // 2. Win Reduction
            netR = netR * params.winReduction;
            // 5. Regime Shift RR reduction
            if (params.regimeShiftRR > 0) {
              netR = netR * (1 - params.regimeShiftRR);
            }
          }

          // 6. Slippage: always subtract per trade
          netR = netR - params.slippage;

          // 4. Trigger new cluster if this trade is a loss
          if (!isTP && params.lossClustering > 0 && clusterRemaining === 0 && rand() < params.lossClustering) {
            clusterRemaining = Math.floor(rand() * (params.clusterSize - 1)) + 1;
          }

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
      attachments: z.string().nullable().optional(), // JSON string
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
        // detect instrument from sheet name
        let instrument = 'EUR';
        if (sheetName.toUpperCase().includes('GER')) instrument = 'GER';
        else if (sheetName.toUpperCase().includes('XAU') || sheetName.toUpperCase().includes('GOLD')) instrument = 'XAU';

        // Skip non-raw sheets and live sheet
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

          // Normalize month: "2021 - 01" → "2021-01"
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
    // auto tradeNum
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

  // ── Bulk backtest entry (from manual database builder) ────────────────────
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

// ─── ForexFactory news (red/orange, USD/EUR/GBP only) ───────────────────────
let newsCache: { ts: number; data: any[] } = { ts: 0, data: [] };

import { spawnSync } from 'child_process';

async function scrapeForexFactory(): Promise<any[]> {
  const scriptPath = '/home/user/tsct-app/scripts/scrape_news.py';
  const result = spawnSync('python3', [scriptPath], { timeout: 40000, encoding: 'utf8' });
  if (result.error) throw result.error;
  const out = (result.stdout ?? '').trim();
  if (!out) return [];
  return JSON.parse(out);
}

app.get('/news', async (c) => {
  const now = Date.now();
  if (now - newsCache.ts < 5 * 60 * 1000) {
    return c.json(newsCache.data);
  }
  try {
    const data = await scrapeForexFactory();
    newsCache = { ts: now, data };
    return c.json(data);
  } catch (e) {
    console.error('news scrape error', e);
    // return stale if available
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

        // Filter out null/undefined closes
        const valid = closes.map((c, i) => ({ c, t: timestamps[i] })).filter(x => x.c != null);
        if (valid.length < 2) { results[key] = null; return; }

        // Find Monday of current week (UTC)
        const now = new Date();
        const dayOfWeek = now.getUTCDay(); // 0=Sun,1=Mon,...6=Sat
        const daysFromMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysFromMon);

        // Filter candles from Monday onwards
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

export type AppType = typeof app;
export default app;
