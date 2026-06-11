import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { uidParam, getSession } from "../lib/session";
import { useMobile } from "../hooks/useMobile";
import AccessWrapper from "../components/AccessWrapper";
import { fetchAccess } from "../lib/access";

async function fetchStats() {
  const r = await fetch(`/api/stats${uidParam()}`);
  return r.json();
}

async function fetchLive() {
  const r = await fetch(`/api/live-trades${uidParam()}`);
  return r.json();
}

async function fetchNews() {
  const r = await fetch('/api/news');
  return r.json();
}

async function fetchPrices() {
  const r = await fetch('/api/prices');
  return r.json();
}

// ── News helpers ──────────────────────────────────────────────────────────────

function parseFFIsoDate(isoStr: string): Date | null {
  if (!isoStr) return null;
  try { return new Date(isoStr); } catch { return null; }
}

// UTC offset options: UTC-12 to UTC+14
const UTC_OFFSETS: { label: string; offsetHours: number }[] = (() => {
  const opts = [];
  for (let h = -12; h <= 14; h++) {
    opts.push({ label: h === 0 ? 'UTC' : h > 0 ? `UTC+${h}` : `UTC${h}`, offsetHours: h });
  }
  return opts;
})();

function getStoredTzOffset(): number {
  try {
    const v = localStorage.getItem('news_tz_offset');
    if (v !== null) return Number(v);
  } catch {}
  return 0; // default UTC
}

function formatTimeWithOffset(dt: Date, offsetHours: number): string {
  // dt is a true UTC timestamp; shift by offsetHours to display
  const shifted = new Date(dt.getTime() + offsetHours * 3600_000);
  const hh = String(shifted.getUTCHours()).padStart(2, '0');
  const mm = String(shifted.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatDayLabelWithOffset(dt: Date, offsetHours: number): string {
  const shifted = new Date(dt.getTime() + offsetHours * 3600_000);
  return shifted.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function TimezoneDropdown({ offsetHours, onChange }: { offsetHours: number; onChange: (h: number) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const selectedLabel = UTC_OFFSETS.find(o => o.offsetHours === offsetHours)?.label ?? 'UTC';

  const updatePos = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
  };
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onScroll = () => updatePos();
    const onResize = () => updatePos();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  const handleOpen = () => { updatePos(); setOpen(o => !o); };

  return (
    <div style={{ display: 'inline-block' }}>
      <button
        ref={btnRef}
        onClick={handleOpen}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
          color: 'var(--text2)', fontSize: 11,
        }}
      >
        <span>{selectedLabel}</span>
        <span style={{ fontSize: 9 }}>▼</span>
      </button>
      {open && (
        <div ref={dropRef} style={{
          position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 8, minWidth: 130,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column', gap: 2,
          maxHeight: 260, overflowY: 'auto',
        }}>
          {UTC_OFFSETS.map(opt => {
            const isSelected = opt.offsetHours === offsetHours;
            return (
              <button
                key={opt.label}
                onClick={() => { onChange(opt.offsetHours); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 10px', borderRadius: 7, cursor: 'pointer',
                  background: isSelected ? 'rgba(99,102,241,0.15)' : 'transparent',
                  border: isSelected ? '1px solid rgba(99,102,241,0.4)' : '1px solid transparent',
                  color: isSelected ? 'var(--text)' : 'var(--text2)',
                  fontSize: 12, textAlign: 'left', transition: 'all 0.15s',
                }}
              >
                <span style={{
                  width: 16, height: 16, borderRadius: 8,
                  background: isSelected ? 'rgba(99,102,241,0.25)' : 'var(--surface2)',
                  border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, fontSize: 9,
                }}>{isSelected ? '●' : ''}</span>
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NewsWidget({ selectedAssets }: { selectedAssets: string[] }) {
  const [tick, setTick] = useState(0);
  const [tzOffset, setTzOffset] = useState<number>(getStoredTzOffset);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, [tick]);

  const handleTzChange = (h: number) => {
    setTzOffset(h);
    try { localStorage.setItem('news_tz_offset', String(h)); } catch {}
  };

  const { data: news = [], isLoading, isError } = useQuery({
    queryKey: ['news'],
    queryFn: fetchNews,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  });

  if (isLoading) return <div style={{ color: 'var(--text2)', fontSize: 12, padding: '8px 0' }}>Loading...</div>;
  if (isError) return <div style={{ color: 'var(--red)', fontSize: 12 }}>Failed to load news.</div>;

  const relevantCurrencies = new Set<string>();
  for (const key of selectedAssets) {
    for (const c of (ALL_ASSETS[key]?.ffCurrencies ?? [])) {
      relevantCurrencies.add(c);
    }
  }

  // Use true UTC "now" for all time math — event timestamps are UTC
  const nowMs = Date.now();
  // Window: show events from 3h ago up to 2 days ahead (UTC)
  const windowEnd = new Date(nowMs + 7 * 86400_000);

  const enriched = (news as any[])
    .map(item => ({ ...item, dt: parseFFIsoDate(item.isoDate) }))
    .filter(item => {
      if (!item.dt) return false;
      if (!relevantCurrencies.has(item.currency)) return false;
      return item.dt.getTime() >= nowMs - 3 * 60 * 60_000 && item.dt <= windowEnd;
    })
    .sort((a, b) => a.dt!.getTime() - b.dt!.getTime());

  if (!enriched.length) return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <TimezoneDropdown offsetHours={tzOffset} onChange={handleTzChange} />
      </div>
      <div style={{ color: 'var(--text2)', fontSize: 12, padding: '8px 0' }}>No upcoming high-impact news this week.</div>
    </div>
  );

  // Group by day label in the selected timezone
  const grouped: Record<string, typeof enriched> = {};
  for (const item of enriched) {
    const key = formatDayLabelWithOffset(item.dt!, tzOffset);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <TimezoneDropdown offsetHours={tzOffset} onChange={handleTzChange} />
      </div>
      {Object.entries(grouped).map(([dayLabel, items]) => {
        const hasLive = items.some(it => it.dt && Math.abs(it.dt.getTime() - nowMs) <= 15 * 60_000);
        return (
          <div key={dayLabel}>
            <div style={{
              fontSize: 10, color: 'var(--text2)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {dayLabel}
              {hasLive && <span style={{ fontSize: 9, background: '#16a34a', color: '#fff', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>NOW</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {items.map((item, i) => {
                if (!item.dt) return null;
                const diffMin = (item.dt.getTime() - nowMs) / 60_000;
                const isLive = Math.abs(diffMin) <= 15;
                const isSoon = diffMin > 15 && diffMin <= 180;
                let rowBg = '#1a1d24', rowBorder = '#2a2d36';
                if (isLive) { rowBg = 'rgba(22,163,74,0.13)'; rowBorder = 'rgba(22,163,74,0.5)'; }
                else if (isSoon) { rowBg = 'rgba(249,115,22,0.09)'; rowBorder = 'rgba(249,115,22,0.30)'; }
                const displayTime = formatTimeWithOffset(item.dt, tzOffset);
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', borderRadius: 7,
                    background: rowBg, border: `1px solid ${rowBorder}`,
                    transition: 'background 0.3s',
                  }}>
                    <div style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                      background: item.impact === 'red' ? '#ef4444' : '#f97316',
                      boxShadow: item.impact === 'red' ? '0 0 5px #ef4444aa' : '0 0 5px #f97316aa',
                    }} />
                    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', color: '#9ca3af', minWidth: 28 }}>{item.currency}</span>
                    <span style={{ fontSize: 10, fontFamily: 'monospace', minWidth: 42, color: isLive ? '#4ade80' : isSoon ? '#facc15' : '#6b7280', fontWeight: isLive || isSoon ? 700 : 400 }}>{displayTime}</span>
                    <span style={{ fontSize: 12, flex: 1, color: isLive ? '#f1f5f9' : isSoon ? '#e2e8f0' : '#94a3b8', fontWeight: isLive ? 600 : 400 }}>{item.title}</span>
                    {isLive && <span style={{ fontSize: 9, background: '#16a34a', color: '#fff', borderRadius: 4, padding: '1px 6px', fontWeight: 700, flexShrink: 0 }}>NOW</span>}
                    {isSoon && !isLive && <span style={{ fontSize: 9, color: '#f97316', fontFamily: 'monospace', flexShrink: 0 }}>{diffMin < 60 ? `${Math.round(diffMin)}m` : `${Math.floor(diffMin/60)}h${Math.round(diffMin%60)}m`}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const ALL_ASSETS: Record<string, {
  label: string;
  symbol: React.ReactNode;
  ffCurrencies: string[];
  priceKey: string;
}> = {
  EUR: {
    label: 'EUR/USD',
    symbol: <span style={{ fontSize: 17, fontWeight: 700, fontFamily: 'serif', color: 'var(--text2)' }}>€</span>,
    ffCurrencies: ['EUR', 'USD'],
    priceKey: 'EUR',
  },
  GBP: {
    label: 'GBP/USD',
    symbol: <span style={{ fontSize: 17, fontWeight: 700, fontFamily: 'serif', color: 'var(--text2)' }}>£</span>,
    ffCurrencies: ['GBP', 'USD'],
    priceKey: 'GBP',
  },
  XAU: {
    label: 'XAU/USD',
    symbol: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="7" width="16" height="9" rx="2" fill="none" stroke="var(--text2)" strokeWidth="1.5"/>
        <rect x="5" y="4" width="10" height="4" rx="1.5" fill="none" stroke="var(--text2)" strokeWidth="1.3"/>
        <line x1="6" y1="11" x2="14" y2="11" stroke="var(--text2)" strokeWidth="1" strokeLinecap="round"/>
      </svg>
    ),
    ffCurrencies: ['USD'],
    priceKey: 'XAU',
  },
  GER: {
    label: 'DAX',
    symbol: <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text2)', fontFamily: 'monospace' }}>DAX</span>,
    ffCurrencies: ['EUR'],
    priceKey: 'GER',
  },
  BTC: {
    label: 'BTC/USD',
    symbol: <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', fontFamily: 'monospace' }}>₿</span>,
    ffCurrencies: ['USD'],
    priceKey: 'BTC',
  },
  ETH: {
    label: 'ETH/USD',
    symbol: <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', fontFamily: 'monospace' }}>Ξ</span>,
    ffCurrencies: ['USD'],
    priceKey: 'ETH',
  },
  XAG: {
    label: 'XAG/USD',
    symbol: <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', fontFamily: 'monospace' }}>Ag</span>,
    ffCurrencies: ['USD'],
    priceKey: 'XAG',
  },
  NAS: {
    label: 'NAS100',
    symbol: <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', fontFamily: 'monospace' }}>NAS</span>,
    ffCurrencies: ['USD'],
    priceKey: 'NAS',
  },
};

const DEFAULT_SELECTED = ['EUR', 'GBP', 'XAU', 'GER'];

function useSelectedAssets() {
  const [selected, setSelected] = useState<string[]>(DEFAULT_SELECTED);

  useEffect(() => {
    fetch(`/api/prefs/selectedAssets${uidParam()}`)
      .then(r => r.json())
      .then((d: { value: string | null }) => {
        if (d.value) {
          try { setSelected(JSON.parse(d.value)); } catch {}
        }
      })
      .catch(() => {});
  }, []);

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = prev.includes(key)
        ? prev.length > 1 ? prev.filter(k => k !== key) : prev
        : [...prev, key];
      fetch(`/api/prefs/selectedAssets${uidParam()}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(next) }),
      }).catch(() => {});
      return next;
    });
  };
  return { selected, toggle };
}

function AssetDropdown({ selected, toggle }: { selected: string[]; toggle: (k: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const updatePos = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
  };
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onScroll = () => updatePos();
    const onResize = () => updatePos();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);
  const handleOpen = () => {
    updatePos();
    setOpen(o => !o);
  };
  return (
    <div style={{ display: 'inline-block' }}>
      <button
        ref={btnRef}
        onClick={handleOpen}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
          color: 'var(--text2)', fontSize: 11,
        }}
      >
        <span>{selected.length} assets</span>
        <span style={{ fontSize: 9 }}>▼</span>
      </button>
      {open && (
        <div ref={dropRef} style={{
          position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 8, minWidth: 190,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          {Object.entries(ALL_ASSETS).map(([key, meta]) => {
            const isOn = selected.includes(key);
            return (
              <button
                key={key}
                onClick={() => toggle(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 10px', borderRadius: 7, cursor: 'pointer',
                  background: isOn ? 'rgba(99,102,241,0.15)' : 'transparent',
                  border: isOn ? '1px solid rgba(99,102,241,0.4)' : '1px solid transparent',
                  color: isOn ? 'var(--text)' : 'var(--text2)',
                  fontSize: 12, textAlign: 'left', transition: 'all 0.15s',
                }}
              >
                <span style={{
                  width: 20, height: 20, borderRadius: 5,
                  background: isOn ? 'rgba(99,102,241,0.25)' : 'var(--surface2)',
                  border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, fontSize: 10,
                }}>{isOn ? '✓' : ''}</span>
                <span style={{ flex: 1 }}>{meta.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WeeklyChanges({ selected, toggle }: { selected: string[]; toggle: (k: string) => void }) {
  const { data: prices, isLoading } = useQuery({
    queryKey: ['prices'],
    queryFn: fetchPrices,
    refetchInterval: 10 * 60 * 1000,
    staleTime: 9 * 60 * 1000,
  });
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const daysFromMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysFromMon));
  const monName = monDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const todayName = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const weekLabel = daysFromMon === 0 ? todayName : `${monName} – ${todayName}`;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text2)' }}>Week change · {weekLabel}</span>
        <AssetDropdown selected={selected} toggle={toggle} />
      </div>
      <style>{`
        .asset-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          justify-items: stretch;
        }
        @media (max-width: 600px) {
          .asset-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        .asset-card:last-child {
          grid-column: auto !important;
          justify-self: start;
          width: 100%;
        }
      `}</style>
      <div className="asset-grid">
        {selected.map(key => {
          const meta = ALL_ASSETS[key];
          if (!meta) return null;
          const entry = (prices as any)?.[meta.priceKey];
          const change: number | null = entry?.change ?? null;
          const isPos = change !== null && change >= 0;
          const color = change === null ? 'var(--text2)' : 'var(--text)';
          const arrow = change === null ? '' : isPos ? '▲' : '▼';
          return (
            <div key={key} className="asset-card" style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '10px 16px',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'var(--surface2)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>{meta.symbol}</div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 2 }}>{meta.label}</div>
                <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'monospace', color }}>
                  {isLoading ? '…' : change === null ? '—' : `${arrow} ${Math.abs(change).toFixed(2)}%`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', padding: '12px 14px',
      borderRadius: 12, flex: '1 1 120px', minWidth: 0,
    }}>
      <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
      <div className="mono" style={{ fontSize: 20, fontWeight: 500, color: color ?? 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24, minWidth: 0, overflow: 'hidden' }}>
      <div style={{
        fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.08em',
        marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 6
      }}>{title}</div>
      {children}
    </div>
  );
}

const INSTRUMENTS = ['EUR', 'GER', 'XAU'];

// ── Profitability ─────────────────────────────────────────────────────────────
function Profitability({ trades }: { trades: any[] }) {
  const n = trades.length;
  if (!n) return <div style={{ color: 'var(--text2)', fontSize: 13 }}>No live trades yet.</div>;
  const won = trades.filter(t => t.result === 'tp').length;
  const lost = trades.filter(t => t.result === 'sl').length;
  const be = trades.filter(t => t.result === 'be').length;
  const wonPct = (won / n) * 100;
  const lostPct = (lost / n) * 100;
  const bePct = (be / n) * 100;

  const Bar = ({ label, pct, color, count }: { label: string; pct: number; color: string; count: number }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>{label}</span>
        <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text)' }}>
          {pct.toFixed(1)}% <span style={{ color: 'var(--text2)', fontSize: 11 }}>({count})</span>
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'var(--surface)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: color, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 420 }}>
      <Bar label="Won" pct={wonPct} color="#7eb8f7" count={won} />
      <Bar label="Lost" pct={lostPct} color="#f0a070" count={lost} />
      {be > 0 && <Bar label="Break Even" pct={bePct} color="#888" count={be} />}
      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>{n} total trades</div>
    </div>
  );
}

// ── Session Win Rates ─────────────────────────────────────────────────────────
function SessionWinRates({ trades }: { trades: any[] }) {
  if (!trades.length) return <div style={{ color: 'var(--text2)', fontSize: 13 }}>No live trades yet.</div>;

  const bySess: Record<string, { total: number; wins: number; netR: number }> = {};
  for (const t of trades) {
    const k = (t.session as string | null)?.trim() || 'Other';
    if (!bySess[k]) bySess[k] = { total: 0, wins: 0, netR: 0 };
    bySess[k].total++;
    if (t.result === 'tp') bySess[k].wins++;
    bySess[k].netR += t.netR ?? 0;
  }

  const rows = Object.entries(bySess)
    .map(([k, v]) => ({ key: k, wr: v.total ? (v.wins / v.total) * 100 : 0, n: v.total, netR: Math.round(v.netR * 100) / 100 }))
    .sort((a, b) => b.n - a.n);

  const SESS_COLORS: Record<string, string> = {
    London: '#7eb8f7', 'New York': '#a78bfa', NY: '#a78bfa',
    Asia: '#f0c070', Asian: '#f0c070', Other: '#888',
  };
  const getColor = (k: string) => SESS_COLORS[k] ?? '#7eb8f7';

  return (
    <div style={{ maxWidth: 420 }}>
      {rows.map(r => (
        <div key={r.key} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>{r.key}</span>
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text)' }}>
              {r.wr.toFixed(1)}% WR
              <span style={{ color: 'var(--text2)', fontSize: 11 }}> · {r.n} trades · </span>
              <span style={{ color: r.netR >= 0 ? '#7eb8f7' : '#f0a070', fontSize: 11 }}>
                {r.netR >= 0 ? '+' : ''}{r.netR.toFixed(2)}R
              </span>
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'var(--surface)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${r.wr}%`, borderRadius: 4, background: getColor(r.key), transition: 'width 0.4s ease' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Most Traded Instruments ───────────────────────────────────────────────────
function MostTradedInstruments({ trades }: { trades: any[] }) {
  if (!trades.length) return <div style={{ color: 'var(--text2)', fontSize: 13 }}>No live trades yet.</div>;

  const byInst: Record<string, { n: number; wins: number; netR: number }> = {};
  for (const t of trades) {
    const k = ((t.asset as string | null) ?? '—').toUpperCase();
    if (!byInst[k]) byInst[k] = { n: 0, wins: 0, netR: 0 };
    byInst[k].n++;
    if (t.result === 'tp') byInst[k].wins++;
    byInst[k].netR += t.netR ?? 0;
  }

  const total = trades.length;
  const rows = Object.entries(byInst)
    .map(([k, v]) => ({ key: k, pct: (v.n / total) * 100, n: v.n, wr: v.n ? (v.wins / v.n) * 100 : 0, netR: Math.round(v.netR * 100) / 100 }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 6);

  const PALETTE = ['#7eb8f7', '#a78bfa', '#f0c070', '#7dd3b0', '#f0a070', '#94a3b8'];

  // simple SVG donut
  const size = 120;
  const r = 44;
  const cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const slices = rows.map((row, i) => {
    const dash = (row.pct / 100) * circumference;
    const gap = circumference - dash;
    const slice = { dash, gap, offset, color: PALETTE[i] ?? '#555', key: row.key };
    offset += dash;
    return slice;
  });

  return (
    <div style={{ display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
      {/* Donut */}
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface)" strokeWidth={18} />
        {slices.map(s => (
          <circle key={s.key} cx={cx} cy={cy} r={r} fill="none"
            stroke={s.color} strokeWidth={18}
            strokeDasharray={`${s.dash} ${s.gap}`}
            strokeDashoffset={-s.offset + circumference / 4}
            style={{ transition: 'stroke-dasharray 0.4s ease' }}
          />
        ))}
        <text x={cx} y={cy + 4} textAnchor="middle" style={{ fontSize: 13, fill: 'var(--text2)', fontFamily: 'monospace' }}>
          {total}
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" style={{ fontSize: 9, fill: 'var(--text2)' }}>
          trades
        </text>
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {rows.map((row, i) => (
          <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: PALETTE[i] ?? '#555', flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, minWidth: 48 }}>{row.key}</span>
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text2)' }}>{row.pct.toFixed(1)}%</span>
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>({row.n})</span>
            <span style={{ fontSize: 11, color: row.netR >= 0 ? '#7eb8f7' : '#f0a070' }}>{row.netR >= 0 ? '+' : ''}{row.netR.toFixed(2)}R</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Weak Spots ────────────────────────────────────────────────────────────────
function WeakSpots({ trades }: { trades: any[] }) {
  if (!trades.length) return <div style={{ color: 'var(--text2)', fontSize: 13 }}>No live trades yet.</div>;

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function groupStats(items: any[]) {
    const n = items.length;
    if (!n) return { n: 0, totalR: 0, wr: 0 };
    const totalR = Math.round(items.reduce((a, t) => a + (t.netR ?? 0), 0) * 100) / 100;
    const wins = items.filter(t => t.result === 'tp').length;
    return { n, totalR, wr: wins / n };
  }

  // by instrument
  const byInst: Record<string, any[]> = {};
  for (const t of trades) { const k = (t.asset ?? '—').toUpperCase(); (byInst[k] ??= []).push(t); }
  const instRows = Object.entries(byInst)
    .map(([k, arr]) => ({ key: k, ...groupStats(arr) }))
    .sort((a, b) => a.totalR - b.totalR).slice(0, 3);

  // by session
  const bySess: Record<string, any[]> = {};
  for (const t of trades) { const k = t.session ?? '—'; (bySess[k] ??= []).push(t); }
  const sessRows = Object.entries(bySess)
    .map(([k, arr]) => ({ key: k, ...groupStats(arr) }))
    .sort((a, b) => a.totalR - b.totalR).slice(0, 3);

  // by day of week (from createdAt)
  const byDay: Record<string, any[]> = {};
  for (const t of trades) {
    const d = t.createdAt ? (DAYS[new Date(t.createdAt).getDay()] ?? '—') : '—';
    (byDay[d] ??= []).push(t);
  }
  const dayRows = Object.entries(byDay)
    .map(([k, arr]) => ({ key: k, ...groupStats(arr) }))
    .sort((a, b) => a.totalR - b.totalR).slice(0, 3);

  const col = (r: number) => r >= 0 ? '#7eb8f7' : '#f0a070';

  function IslandGroup({ rows, label }: { rows: { key: string; n: number; totalR: number; wr: number }[]; label: string }) {
    return (
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{label}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map(r => (
            <div key={r.key} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', background: 'var(--surface)',
              border: '1px solid var(--border)', borderRadius: 10, gap: 12,
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, minWidth: 60 }}>{r.key}</span>
              <span style={{ fontFamily: 'monospace', fontSize: 13, color: col(r.totalR), minWidth: 56, textAlign: 'right' }}>
                {r.totalR >= 0 ? '+' : ''}{r.totalR.toFixed(2)}R
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text2)', minWidth: 36, textAlign: 'right' }}>
                {(r.wr * 100).toFixed(0)}%
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text2)', minWidth: 24, textAlign: 'right' }}>
                {r.n}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      <IslandGroup rows={instRows} label="By Instrument" />
      <IslandGroup rows={sessRows} label="By Session" />
      <IslandGroup rows={dayRows} label="By Day" />
    </div>
  );
}

// ── Consistency Score ─────────────────────────────────────────────────────────
function ConsistencyScore({ trades, btAvgRR, lvAvgRR }: { trades: any[]; btAvgRR: number; lvAvgRR: number }) {
  type TargetMode = 'manual' | 'backtest' | 'live';
  const [mode, setMode] = useState<TargetMode>(() => (localStorage.getItem('cs_mode') as TargetMode) ?? 'live');
  const [manualRR, setManualRR] = useState(() => localStorage.getItem('cs_manual_rr') ?? '2');
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => { localStorage.setItem('cs_mode', mode); }, [mode]);
  useEffect(() => { localStorage.setItem('cs_manual_rr', manualRR); }, [manualRR]);

  const targetRR = mode === 'manual' ? parseFloat(manualRR) || 0
    : mode === 'backtest' ? btAvgRR
    : lvAvgRR;

  const n = trades.length;
  if (!n) return <div style={{ color: 'var(--text2)', fontSize: 13 }}>No live trades yet.</div>;

  const netrArr = trades.map(t => t.netR ?? 0);
  const mean = netrArr.reduce((a, b) => a + b, 0) / n;
  const variance = netrArr.reduce((a, r) => a + (r - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);

  // % trades within [0, targetRR] for wins, or [-targetRR, 0) for losses (i.e. within plan)
  const inRange = targetRR > 0
    ? trades.filter(t => {
        const r = t.netR ?? 0;
        return r >= -targetRR && r <= targetRR;
      }).length
    : 0;
  const inRangePct = targetRR > 0 ? (inRange / n) * 100 : null;

  // score 0-100: penalise high std, reward in-range %
  const stdScore = Math.max(0, 100 - std * 20);
  const rangeScore = inRangePct ?? stdScore;
  const score = inRangePct != null ? Math.round((stdScore + rangeScore) / 2) : Math.round(stdScore);

  const scoreColor = score >= 70 ? '#7eb8f7' : score >= 40 ? '#f0c070' : '#f0a070';
  const scoreLabel = score >= 70 ? 'Consistent' : score >= 40 ? 'Moderate' : 'Inconsistent';

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: '3px 10px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
    background: active ? 'var(--blue)' : 'var(--surface)',
    border: `1px solid ${active ? 'var(--blue)' : 'var(--border)'}`,
    color: active ? '#fff' : 'var(--text2)',
  });

  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {/* Score */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 80 }}>
        <div style={{ fontSize: 36, fontWeight: 700, fontFamily: 'monospace', color: scoreColor, lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 11, color: scoreColor }}>{scoreLabel}</div>
        <div style={{ fontSize: 10, color: 'var(--text2)' }}>/ 100</div>
      </div>

      {/* Breakdown */}
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 2 }}>Std Dev R</div>
            <div style={{ fontFamily: 'monospace', fontSize: 14, color: std <= 1 ? '#7eb8f7' : std <= 2 ? '#f0c070' : '#f0a070' }}>{std.toFixed(2)}</div>
          </div>
          {inRangePct != null && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 2 }}>In Range</div>
              <div style={{ fontFamily: 'monospace', fontSize: 14, color: inRangePct >= 70 ? '#7eb8f7' : inRangePct >= 50 ? '#f0c070' : '#f0a070' }}>{inRangePct.toFixed(0)}%</div>
            </div>
          )}
          <div>
            <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 2 }}>Target RR</div>
            <div style={{ fontFamily: 'monospace', fontSize: 14, color: 'var(--text)' }}>{targetRR > 0 ? targetRR.toFixed(2) : '—'}</div>
          </div>
        </div>

        {/* Target selector */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={btnStyle(mode === 'live')} onClick={() => setMode('live')}>Avg Live RR</button>
          <button style={btnStyle(mode === 'backtest')} onClick={() => setMode('backtest')}>Avg BT RR</button>
          <button style={btnStyle(mode === 'manual')} onClick={() => setMode('manual')}>Manual</button>
          {mode === 'manual' && (
            <input
              type="number" min="0.1" step="0.1" value={manualRR}
              onChange={e => setManualRR(e.target.value)}
              style={{ width: 64, padding: '3px 8px', fontSize: 12, borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'monospace', MozAppearance: 'textfield' } as any}
              placeholder="2.0"
            />
          )}
          <button
            onClick={() => setShowInfo(v => !v)}
            style={{ marginLeft: 4, width: 18, height: 18, borderRadius: '50%', border: '1px solid var(--border)', background: showInfo ? 'var(--blue)' : 'var(--surface)', color: showInfo ? '#fff' : 'var(--text2)', fontSize: 11, lineHeight: '18px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}
          >?</button>
        </div>

        {showInfo && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
            <div style={{ color: 'var(--text)', fontWeight: 600, marginBottom: 6, fontSize: 12 }}>Як розраховується показник стабільності</div>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: 'var(--text)' }}>Оцінка відхилення</span> — базується на стандартному відхиленні net R по всіх угодах.
              Менше відхилення = більш передбачувані результати. Оцінка: <span style={{ fontFamily: 'monospace' }}>max(0, 100 − stdDev × 20)</span>
            </div>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: 'var(--text)' }}>Оцінка влучності</span> — % угод, де net R потрапляє в діапазон <span style={{ fontFamily: 'monospace' }}>[−targetRR, +targetRR]</span>.
              Угоди поза діапазоном (надто великі прибутки або збитки) знижують оцінку.
            </div>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: 'var(--text)' }}>Підсумкова оцінка</span> — середнє обох: <span style={{ fontFamily: 'monospace' }}>(оцінкаВідхилення + оцінкаВлучності) / 2</span>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 6 }}>
              <span style={{ color: '#7eb8f7' }}>≥ 70</span> Стабільний &nbsp;·&nbsp;
              <span style={{ color: '#f0c070' }}>40–69</span> Помірний &nbsp;·&nbsp;
              <span style={{ color: '#f0a070' }}>&lt; 40</span> Нестабільний
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function calcQuickStats(trades: any[]) {
  const n = trades.length;
  if (n === 0) return null;
  const netrArr = trades.map((t: any) => t.netR ?? 0);
  const totalR = Math.round(netrArr.reduce((a, b) => a + b, 0) * 100) / 100;
  const wins = trades.filter((t: any) => t.result === 'tp').length;
  const wr = n > 0 ? wins / n : 0;
  const rrs = trades.filter((t: any) => t.rr != null && t.rr > 0).map((t: any) => t.rr!);
  const avgRR = rrs.length ? rrs.reduce((a: number, b: number) => a + b, 0) / rrs.length : 0;
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
}

export default function Dashboard() {
  const isMobile = useMobile();
  const { data, isLoading, error } = useQuery({ queryKey: ['stats'], queryFn: fetchStats, refetchInterval: 10000 });
  const { data: liveTrades = [] } = useQuery({ queryKey: ['live-trades'], queryFn: fetchLive, refetchInterval: 10000 });
  const [btTab, setBtTab] = useState('EUR');
  const { selected: selectedAssets, toggle: toggleAsset } = useSelectedAssets();

  const session = getSession();
  const { data: accessData } = useQuery({
    queryKey: ['access'],
    queryFn: fetchAccess,
    enabled: Boolean(session),
    staleTime: 60_000,
  });

  const isBlocked = Boolean(accessData && !accessData.hasAccess);
  

  if (isLoading) return <div style={{ padding: 32, color: 'var(--text2)' }}>Loading...</div>;
  if (false) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>
          Access Restricted
        </div>
        <div style={{ fontSize: 16, color: 'var(--text2)' }}>
          Manage your plan to get full access
        </div>
      </div>
    );
  }
  if (error || !data) return <div style={{ padding: 32, color: 'var(--red)' }}>Error loading stats</div>;

  const bt = (data as any).btStats;
  const lv = (data as any).lvStats;
  const liveByMonth = (data as any).liveByMonth ?? {};
  const btByInst = (data as any).btByInstrument ?? {};
  const btByInstYear = (data as any).btByInstrumentYear ?? {};

  const fmt = (n: number, d = 2) => n.toFixed(d);
  const pct = (n: number) => (n * 100).toFixed(1) + '%';

  const instYears = btByInstYear[btTab] ?? {};

  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);
  const currentMonthTrades = (liveTrades as any[]).filter((t: any) => (t.month ?? '').slice(0, 7) === currentMonth);
  const currentMonthStats = calcQuickStats(currentMonthTrades);
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);
  const prevMonthTrades = (liveTrades as any[]).filter((t: any) => (t.month ?? '').slice(0, 7) === prevMonth);
  const prevMonthStats = calcQuickStats(prevMonthTrades);

  const p = isMobile ? '16px' : '24px 28px';

  return (
    <AccessWrapper blocked={isBlocked} reason={accessData?.reason}>
      <div style={{ padding: p, maxWidth: 1200, width: '100%', overflow: 'hidden' }}>
        {(() => {
          const localHour = new Date(now.getTime() + getStoredTzOffset() * 3600_000).getUTCHours();
          const greeting = localHour >= 5 && localHour < 12 ? 'Good morning' : localHour >= 12 && localHour < 18 ? 'Good afternoon' : 'Good evening';
          const nick = getSession()?.nickname;
          return (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>{greeting}{nick ? `, ${nick}` : ''}</div>

        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text2)' }}>
          {now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      </div>
          );
        })()}

        {/* FOREX NEWS */}
        <Section title="Upcoming High-Impact News">
          <NewsWidget selectedAssets={selectedAssets} />
        </Section>

        {/* WEEKLY CHANGES */}
        <Section title="Weekly Change">
          <WeeklyChanges selected={selectedAssets} toggle={toggleAsset} />
        </Section>

        {/* WEAK SPOTS */}
        <Section title="Weak Spots — Live">
          <WeakSpots trades={liveTrades as any[]} />
        </Section>

        {/* CONSISTENCY */}
        <Section title="Consistency Score — Live">
          <ConsistencyScore
            trades={liveTrades as any[]}
            btAvgRR={bt?.avgRR ?? 0}
            lvAvgRR={lv?.avgRR ?? 0}
          />
        </Section>

        {/* PROFITABILITY + SESSIONS — side by side on desktop */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>
          <Section title="Profitability — Live">
            <Profitability trades={liveTrades as any[]} />
          </Section>
          <Section title="Session Win Rates — Live">
            <SessionWinRates trades={liveTrades as any[]} />
          </Section>
        </div>

        {/* MOST TRADED INSTRUMENTS */}
        <Section title="Most Traded Instruments — Live">
          <MostTradedInstruments trades={liveTrades as any[]} />
        </Section>

      </div>
    </AccessWrapper>
  );
}


