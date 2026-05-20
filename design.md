# TSCT Dashboard — Design Direction

## Vibe
TradingView / Bloomberg terminal. Dark, data-dense, professional. No decoration.

## Colors
- Background: #0d0f11 (near black)
- Surface: #141619 (cards/panels)
- Surface2: #1c1f23 (inputs, tables row alt)
- Border: #2a2d33
- Text primary: #e8eaed
- Text secondary: #8b9098
- Accent green: #26a69a (profit, TP)
- Accent red: #ef5350 (loss, SL)
- Accent yellow: #f59e0b (BE, warning)
- Accent blue: #3b82f6 (interactive, selected)
- Chart BT: #6b7280 (gray)
- Chart Live: #ef4444 (red)
- Chart MC p5/p95: #374151 (dark gray lines)
- Chart Expected: #22c55e (green)

## Typography
- Font: JetBrains Mono (numbers), Inter (UI)
- Size scale: 11px data, 12px labels, 14px body, 18px headings
- Numbers always monospace

## Layout
- Full-width dark sidebar nav (left, 56px collapsed)
- Main area: dense grid panels
- No rounded cards — sharp corners or minimal 4px radius
- Tight spacing: 8px/12px gaps

## Charts
- Recharts LineChart
- Dark background (#141619)
- Subtle grid lines (#2a2d33)
- No chart border
- Legend: minimal, right side

## Tables
- Alternating rows: #141619 / #1a1d21
- Header: #1c1f23
- No cell padding waste — 4px 8px
- Fixed column widths

## Anti-patterns
- No white backgrounds
- No border-radius > 6px
- No gradients on text
- No drop shadows
