import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { uidParam } from "../lib/session";
import { useMobile } from "../hooks/useMobile";

async function fetchBT() {
  const r = await fetch(`/api/backtest-trades${uidParam()}`);
  return r.json();
}

const INSTRUMENTS = ['ALL', 'EUR', 'GER', 'XAU'];

export default function BacktestTrades() {
  const isMobile = useMobile();
  const qc = useQueryClient();
  const { data: trades = [], isLoading } = useQuery({ queryKey: ['backtest-trades'], queryFn: fetchBT });
  const [filterInst, setFilterInst] = useState('ALL');
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const clearMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/backtest-trades/all${uidParam()}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Failed');
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backtest-trades'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });

  const all = trades as any[];
  const filtered = all.filter(t => {
    if (filterInst !== 'ALL' && t.instrument !== filterInst) return false;
    if (search && !`${t.month} ${t.result} ${t.direction} ${t.session}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const fmt = (n: number | null) => n != null ? n.toFixed(2) : '—';

  const byInst: Record<string, Record<string, Record<string, any[]>>> = {};
  for (const t of filtered) {
    const inst = t.instrument;
    const yr = String(t.year);
    const mo = t.month;
    if (!byInst[inst]) byInst[inst] = {};
    if (!byInst[inst][yr]) byInst[inst][yr] = {};
    if (!byInst[inst][yr][mo]) byInst[inst][yr][mo] = [];
    byInst[inst][yr][mo].push(t);
  }

  const toggleMonth = (key: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const calcGroup = (trades: any[]) => {
    const totalR = trades.reduce((a, t) => a + (t.netR ?? 0), 0);
    const tps = trades.filter(t => t.result === 'tp').length;
    const wr = trades.length > 0 ? ((tps / trades.length) * 100).toFixed(1) + '%' : '—';
    return { totalR, wr, n: trades.length };
  };

  const p = isMobile ? '16px' : '24px 28px';

  return (
    <div style={{ padding: p, width: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Backtest Database</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{all.length} trades</span>
          <button className="btn-danger" style={{ fontSize: 11 }}
            onClick={() => { if (confirm('Clear ALL backtest data?')) clearMutation.mutate(); }}
            disabled={clearMutation.isPending}>
            Clear All
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {INSTRUMENTS.map(inst => (
            <button key={inst}
              className={filterInst === inst ? 'btn-primary' : 'btn-ghost'}
              style={{ padding: '4px 12px', fontSize: 12 }}
              onClick={() => setFilterInst(inst)}>
              {inst}
            </button>
          ))}
        </div>
        <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: isMobile ? '100%' : 180 }} />
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--text2)' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: 'var(--text2)', textAlign: 'center', padding: 40 }}>
          No backtest data. Go to Import to upload xlsx files.
        </div>
      ) : (
        Object.entries(byInst).sort(([a], [b]) => a.localeCompare(b)).map(([inst, byYear]) => {
          const instTrades = filtered.filter(t => t.instrument === inst);
          const instStats = calcGroup(instTrades);
          return (
            <div key={inst} style={{ marginBottom: 28 }}>
              <div style={{
                padding: '8px 12px', background: 'var(--surface2)',
                border: '1px solid var(--border)', borderRadius: 4, marginBottom: 8,
                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              }}>
                <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--blue)' }}>{inst}</span>
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>{instStats.n} trades</span>
                <span className={`mono ${instStats.totalR >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 13 }}>
                  Net R: {instStats.totalR.toFixed(2)}
                </span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--text2)' }}>WR: {instStats.wr}</span>
              </div>

              {Object.entries(byYear).sort(([a], [b]) => a.localeCompare(b)).map(([yr, byMonth]) => {
                const yrTrades = Object.values(byMonth).flat();
                const yrStats = calcGroup(yrTrades);
                return (
                  <div key={yr} style={{ marginBottom: 16, marginLeft: isMobile ? 8 : 12 }}>
                    <div style={{
                      padding: '5px 10px', background: '#161820',
                      border: '1px solid #2a2d35', borderRadius: 4, marginBottom: 6,
                      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                    }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{yr}</span>
                      <span style={{ fontSize: 11, color: 'var(--text2)' }}>{yrStats.n} trades</span>
                      <span className={`mono ${yrStats.totalR >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 12 }}>
                        Net R: {yrStats.totalR.toFixed(2)}
                      </span>
                      <span className="mono" style={{ fontSize: 12, color: 'var(--text2)' }}>WR: {yrStats.wr}</span>
                    </div>

                    {Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, mTrades]) => {
                      const mStats = calcGroup(mTrades);
                      const mKey = `${inst}__${yr}__${month}`;
                      const isOpen = expandedMonths.has(mKey);
                      return (
                        <div key={month} style={{ marginBottom: 8, marginLeft: isMobile ? 8 : 12 }}>
                          <div
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                              padding: '4px 8px', borderRadius: 4,
                              border: '1px solid var(--border)',
                              background: isOpen ? '#1c2030' : 'var(--surface)',
                              cursor: 'pointer', marginBottom: isOpen ? 4 : 0,
                            }}
                            onClick={() => toggleMonth(mKey)}
                          >
                            <span style={{ fontSize: 11, color: 'var(--text2)', userSelect: 'none' }}>{isOpen ? '▾' : '▸'}</span>
                            <span style={{ fontWeight: 600, fontSize: 12 }}>{month}</span>
                            <span style={{ fontSize: 11, color: 'var(--text2)' }}>{mStats.n} trades</span>
                            <span className={`mono ${mStats.totalR >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 11 }}>
                              {mStats.totalR.toFixed(2)}R
                            </span>
                            <span className="mono" style={{ fontSize: 11, color: 'var(--text2)' }}>{mStats.wr}</span>
                          </div>

                          {isOpen && (
                            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginLeft: isMobile ? 0 : 20, maxWidth: '100%' }}>
                              <table style={{ minWidth: isMobile ? 300 : 420 }}>
                                <thead>
                                  <tr>
                                    <th>#</th><th>Dir</th><th>RR</th><th>Session</th><th>Result</th>
                                    <th>Gross R</th><th>Cost</th><th>Net R</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {mTrades.map((t: any) => (
                                    <tr key={t.id}>
                                      <td className="mono">{t.tradeNum}</td>
                                      <td>{t.direction ?? '—'}</td>
                                      <td className="mono">{fmt(t.rr)}</td>
                                      <td style={{ fontSize: 11 }}>{t.session ? t.session.charAt(0).toUpperCase() + t.session.slice(1) : '—'}</td>
                                      <td><span className={`tag-${t.result}`}>{t.result?.toUpperCase()}</span></td>
                                      <td className={`mono ${(t.grossR ?? 0) >= 0 ? 'pos' : 'neg'}`}>{fmt(t.grossR)}</td>
                                      <td className="mono neg">{fmt(t.cost)}</td>
                                      <td className={`mono ${t.result === 'be' ? 'be' : (t.netR ?? 0) >= 0 ? 'pos' : 'neg'}`}>{fmt(t.netR)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
}
