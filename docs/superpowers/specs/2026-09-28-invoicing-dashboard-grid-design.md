# Invoicing dashboard: a grid-centred workspace with linked charts — Design

## Summary

The invoicing example's dashboard puts a data grid at the centre of the page
and links it to charts in both directions. Selecting a row focuses the charts
on that row's client; clicking a chart mark filters the grid. The assistant is
a third actor on the same selection. The page replaces today's Dashboard and
Payments pages with one screen: a KPI strip, a fixed-height focus band of
charts, and one tabbed grid (Clients, Invoices, Payments, Unapplied).

The example exists to showcase Hashbrown's generative UI while dog-fooding
Pretable and B4. This redesign strengthens both halves: Pretable becomes the
page's main surface rather than a side panel, and the assistant's answers
become part of the page's navigation.

## Why: what the current dashboard gets wrong

Measured against the running app on 2026-09-25 (`main` at 077ca9c5):

- **No charts on the dashboard.** "Monthly activity" is a 24-row HTML table
  scrolling inside its own card, a nested scroll inside a scrolling page.
  `TrendChart` and `AgingSummary` exist, but only in the assistant's kit.
- **Three currencies concatenated into every figure.** KPI tiles such as
  "$1,710,600.00 · €418,200.00 · £383,250.00" wrap across three lines, and zero
  amounts ("€0.00 · £0.00") add noise.
- **The grid is the third section**, below the fold at a 1440×900 viewport.
- **Selecting a payment reaches only two places**: the related-invoices panel
  (off-screen below the grid) and the assistant's context card. KPIs and
  activity never respond.
- **Grid details**: payment references truncate mid-word, the Status column
  reads "Unmatched" on every row under the Unmatched filter, and the selection
  checkbox behaves as a single choice.
- **KPI tiles carry no context**: no comparison and no trend.

## Research grounding

Full report with sources:
[`docs/superpowers/research/2026-09-25-accounting-dashboards.md`](../research/2026-09-25-accounting-dashboards.md).
The findings that shaped this design:

- Real accounting products link **chart → grid** (QuickBooks Money Bar,
  FreshBooks, Zoho Books, Upflow: click an aging bucket, get those invoices).
  Mercury links **grid filters → chart**.
- **Selecting a row to refocus charts elsewhere was not found in any
  accounting, banking or AR product.** It is standard in BI tools (Looker,
  Metabase, Superset). This design is new ground for the category.
- Home dashboards in real products are cards and short lists; full grids live
  on task screens. This page deliberately merges the two.
- Aging buckets (Current, 1–30, 31–60, 61–90, 90+), unapplied cash as its own
  state, and per-client payment behaviour recur everywhere.
- Multi-currency totals are usually converted to a home currency; FreshBooks
  instead toggles one currency per widget, which this design follows.
- Match confidence is shown only as coarse signals (QuickBooks' three colours,
  Xero's green OK), never a percentage.

## Decisions

| Question                      | Decision                                                           |
| ----------------------------- | ------------------------------------------------------------------ |
| How grid and charts link      | Both directions through one shared selection, built row-first      |
| What sits at the heart        | One tabbed grid slot; every selection resolves to a client         |
| Which tabs                    | The core four only: Clients, Invoices, Payments, Unapplied         |
| Feel                          | Modern and snappy (rules in "Interaction and motion")              |
| Where charts live             | A fixed-height focus band above the grid; the assistant rail stays |
| Currencies                    | Native currencies with a switcher, default USD; no conversion      |
| How the assistant moves focus | Click to focus: answer components become focus links               |

Rejected, with reasons: a master-detail layout (it pushes the assistant into a
pop-over, hiding the Hashbrown half of the showcase); charts expanding inside
grid rows (every selection shifts the rows below); converting to a home
currency (the ledger has no exchange rates, and invented rates don't belong in
a finance demo); an assistant that focuses the page on its own (it moves the
page without being asked); a client-side focus tool (the assistant middleware
rejects client tools by design, returning 422).

## Page structure

```
┌ nav ┬──────────────────────────────────────────────────┬ assistant ┐
│     │ KPI strip           [ USD | EUR | GBP ]           │           │
│     ├──────────────────────────────────────────────────┤  answers  │
│     │ Focus band (fixed height)                         │  in the   │
│     │  focus pill · habit       │                        │  current  │
│     │  Invoiced vs received     │  Open by age           │  focus    │
│     │  (or Match this payment)  │                        │           │
│     ├──────────────────────────────────────────────────┤           │
│     │ Clients · Invoices · Payments · Unapplied          │           │
│     │ grid, grouped by currency, sticky header           │  composer │
└─────┴──────────────────────────────────────────────────┴───────────┘
```

One page replaces Dashboard and Payments. The nav keeps its rail.

## Selection model

The selection is one piece of state, owned by the page:

```ts
interface Focus {
  readonly tab: 'clients' | 'invoices' | 'payments' | 'unapplied';
  readonly clientId?: string; // every selection resolves to one
  readonly record?: {
    readonly kind: 'invoice' | 'payment';
    readonly id: string;
  };
  readonly bucket?: AgingBucket; // set by clicking an age bar
  readonly currency: 'USD' | 'EUR' | 'GBP';
}
```

- **Sources**: a grid row (click, ↑/↓), a chart mark (an age bar), and an
  assistant answer component (click to focus).
- **Resolution**: a client row sets `clientId`; an invoice or payment row sets
  `record` and its `clientId`. A single payment has no history to chart, so
  the charts always show the client and mark the record inside them.
- **Currency**: with a client focused, `currency` is that client's and the
  switcher locks; clearing the focus unlocks it.
- **Persistence across tabs**: a focused client stays focused when switching
  tabs, so Clients → Invoices shows that client's invoices.
- **Clearing**: the ✕ on the focus pill, or Esc.
- **URL**: the focus round-trips through the query string
  (`?tab=invoices&client=thistle&bucket=31-60`), so a view can be shared and
  the back button behaves.
- The selection is a pure reducer over explicit actions, so it is testable
  without React.

## Focus band

Fixed height in every state; the grid below never moves.

**1. Nothing selected: the portfolio, in the switcher's currency.** Figures on
the seeded ledger (as of 2026-09-15, net 30 terms):

| Currency        | Open    | Overdue | Unapplied | Avg days to pay |
| --------------- | ------- | ------- | --------- | --------------- |
| USD (8 clients) | $42,305 | $17,167 | $13,900   | 17              |
| GBP (2 clients) | £17,532 | £11,436 | £0        | 26              |
| EUR (2 clients) | €4,500  | €0      | €0        | 24              |

USD aging: Current $25,138 · 1–30 $9,333 · 31–60 $3,968 · 61–90 $138 · 90+
$3,728, summing to the $42,305 open balance.

Charts: **Invoiced vs received, 12 months** (two series) and **Open by age**.
Clicking an age bar filters the grid (PR 3).

**2. A client or invoice selected.** The band, KPIs and switcher focus on the
client. Thistle Retail: £14,000 open, £8,000 overdue, 47 days average to pay,
aging £6,000 current, £6,000 at 1–30, £2,000 at 31–60. An invoice selection
also outlines that invoice's age bar.

**3. A payment selected (Payments or Unapplied tab).** The right half becomes
**Match this payment**: the client's open invoices with checkboxes, an Apply
column, and a running total that must tie out ("$5,000 of $5,000 ✓"), the Xero
and QuickBooks pattern. **Review match** hands off to the existing approval
flow in the assistant, so B4's human approval step is unchanged. This replaces
today's Payments page, its related-invoices panel and its match controls.

## Grids

All four are Pretable surfaces. Every tab groups rows by currency with
per-group totals (Pretable's grouping and aggregates), so amounts only ever
sort within one currency and totals need no exchange rates. The switcher's
currency group comes first.

**Clients** (12), grouped by currency, sorted by overdue descending:
Client · Open · Overdue · Aging (a stacked micro-bar) · Open invoices · Days
to pay · Habit · Unapplied. The open-invoices column exists because Granite
Mutual and Kestrel Energy pay within 6 days but short, leaving 41 small
residuals each, 85–88% of them over 90 days; without the count that write-off
story is invisible.

**Invoices** (489; 98 open: 53 USD, 44 GBP, 1 EUR; 391 paid), filtered to Open
by default, sorted by balance descending: Invoice · Client · Type · Issued ·
Amount · Balance · Status. Type is derived from the description: "monthly
retainer", "project milestone", otherwise One-off (Cedar's
INV-202609-CH-102 is an accessibility sprint). Status: Current, _n_ days
overdue, Partly paid, Paid. Filter chips: Open, Overdue, Paid, All, plus a
removable bucket chip set from the band.

**Payments** (446), newest first: Received · Payer and reference · Amount ·
Applied · Unapplied · Status (Matched, Partly applied, Unmatched). The payer
leads and the full bank reference sits beneath it in a muted monospace line,
fixing today's truncation.

**Unapplied** (5), oldest first: Received · Payer and reference · Unapplied ·
Age · Match hint. The hint is computed, in coarse words:

| Payment                 | Hint                            |
| ----------------------- | ------------------------------- |
| Northstar Labs $2,400   | Exact: INV-202609-NS-101        |
| Cedar Health $2,000     | Partial: $2,000 of $5,000       |
| Harbor Commerce $5,000  | Ties out across 2 invoices      |
| Atlas Analytics $1,500  | Ambiguous: 2 invoices at $1,500 |
| Summit Logistics $3,000 | Advance: no open invoice        |

Rule, in order, over the payer's open invoices in the payment's currency: no
open invoice is an advance; exactly one invoice of the exact amount is an exact
match; else the smallest set of 1–5 invoices summing exactly (Stripe's rule)
ties out; else one invoice larger than the payment is a partial. Two or more
equally good candidates at any step are ambiguous (Atlas has two $1,500
invoices).

**Shared behaviour**: single-row selection by click or ↑/↓ with no
checkboxes; Home/End; Esc clears; keys 1–4 switch tabs; sticky header;
compact rows; tabular numerals; amounts right-aligned with their currency
symbol; status always a dot plus a word; empty cells a muted dash.

## Interaction and motion ("snappy")

- **Instant focus.** The page already holds the ledger in memory, and the
  per-client series in `react/src/ledger-views.ts` (`monthlySeries`,
  `agingTotals`, `customerSummary`) are pure functions over it. Selection
  recomputes the band in the same frame, memoized per client. No spinners;
  a skeleton only on first load.
- **No layout shift.** Fixed band height, reserved space for filter chips,
  stable tab counts.
- **Short, cheap motion.** Band crossfade ~120 ms; bars grow with
  `transform: scaleY`, never by animating height; row hover ~100 ms; exits
  faster than entrances; `prefers-reduced-motion` disables all of it.
- **Hover layer on every chart** (dataviz skill): crosshair and tooltip on the
  trend lines, a tooltip per age bar, hit targets larger than the marks. Each
  chart has a table view; that is where today's monthly table goes.

## Visual system

Swiss minimalism, slate neutrals, dense spacing, tabular numerals, no text
under 12 px, light mode only. From the design search, kept: the style, density
and micro-interaction timings. Rejected as unfit for an app: its landing-page
pattern, scroll-reveal animation, dark-by-default and monospace headings.

Chart colour, assigned by the job each colour does and validated with the
dataviz skill's `validate_palette.js`:

| Use                               | Colours                                                                  | Validation (light surface)                   |
| --------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------- |
| Invoiced vs received (two series) | `#2a78d6`, `#eb6834` (categorical slots 1, 2)                            | all checks pass; CVD ΔE 24.7, normal ΔE 33.6 |
| Age, darker = older (ordinal)     | `#94a3b8` `#7b8aa0` `#5f6f86` `#465569` `#1e293b`                        | monotone, visible steps, light end 2.50:1    |
| Payment habit (status)            | good `#0ca30c`, warning `#fab219`, serious `#ec835a`, critical `#d03b3b` | always with a text label                     |

Blue means "invoiced", so age uses the neutral ramp rather than a blue one,
and selection uses the interface tint on rows plus the darkest ink in charts.

## Assistant

- **Selection → assistant**: the page sends the whole focus as run state
  (client, record, tab), replacing today's `selectedPaymentId`-only state.
  Suggested questions follow the focus ("Ask about Thistle…").
- **Assistant → selection**: CustomerCard and LedgerTable rows in answers
  become focus links. Clicking one sets the page focus. No protocol or
  middleware change.
- **Security**: `server/src/assistant-middleware.ts` already rejects a
  `selectedPaymentId` that isn't a payment in the session's snapshot. The new
  keys get the same check: an unknown `clientId`, or a `record` that doesn't
  exist or belongs to another client, is a 422.

## Delivery: three PRs, each shippable

1. **Row drives charts.** New dashboard: KPI strip and switcher; focus band in
   its portfolio and client states with both charts, hover layers and table
   views; Clients and Invoices tabs; the selection model with URL sync and
   keyboard; full focus sent to the assistant with middleware validation. The
   old Payments page stays, so matching keeps working.
2. **Payments move in.** Payments and Unapplied tabs; the band's matching
   state; match hints. Delete the old Payments page and related-invoices
   panel.
3. **Both directions.** Age bar → Invoices filter chip; answer components as
   focus links.

**The recorded walkthrough must move with the UI.** `e2e/walkthrough/scenes.ts`
(#606) drives today's page by the "Business overview" heading, `.stats`, the
Payments nav and heading, "Review payment-harbor-combined", "Match to …",
"Approve and apply", `.proposal-card` and `.payment-grid`. Each PR updates the
scenes it breaks, and PR 3 re-records the samples-page video.

## Testing

Failing tests first, top-level `test()` with arrange/act/assert (AGENTS.md).

- **Unit, against the seeded ledger**: per-currency totals and aging (pinning
  $42,305 and its buckets); group aggregates; invoice Type including One-off;
  a match hint for each of the five scenarios; the selection reducer and its
  URL round-trip; middleware rejection of unknown or mismatched focus IDs.
- **Component**: each band state; the switcher locking to the client's
  currency; ↑/↓ moving the selection; the band keeping one height; each
  chart's table view.
- **End-to-end** (existing Playwright suite): select Thistle and see £14,000
  in GBP; ↓ to the next client; click an age bar; a full match through
  approval with the existing scripted scenario.
- `nx run-many -t build,test,lint` for invoicing-react and invoicing-server
  on every PR; `nx test` does not type-check, so `build` is required.

## Out of scope

Dark mode; extra grids (Retainers, Matching history, Months, Aging detail,
Collections, Credit notes); currency conversion; collections or reminders;
credit notes; mobile-first layouts. Below 1024 px the charts stack and the
grid scrolls horizontally with its first column pinned.

## Open items for the implementation plan

- The trend chart needs a 12-month invoiced-and-received series per client and
  per currency. `monthlySeries` covers the portfolio; confirm it filters by
  client and currency.
- Confirm the exact Pretable 0.20.2 props for grouping, aggregates, pinned
  columns and focused-row events against its type definitions.
- Short-payer residuals dominate "oldest overdue" orderings; any sort or
  default that uses age will surface them first.
