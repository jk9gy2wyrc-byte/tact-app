# i18n rollout task

## Goal
Full EN translation for all pages. UK stays as-is. useT() hook from lib/i18n.ts.

## Status
- [x] lib/i18n.ts created
- [x] app.tsx: dispatchEvent on lang change
- [ ] mc-simulation.tsx — in progress
- [ ] dashboard.tsx
- [ ] admin-users.tsx
- [ ] live-trades.tsx
- [ ] backtest-trades.tsx
- [ ] live-analysis.tsx
- [ ] backtest-analysis.tsx
- [ ] charts.tsx (biggest — 346 uk lines)
- [ ] subscription.tsx

## Approach
- Add `const t = useT()` to each page's main export function
- Replace hardcoded UK strings with t.key
- For sub-components that don't re-render on lang change, pass t as prop or call getLang() directly (less ideal)
- For sub-components used inside main function, they will get t from closure
