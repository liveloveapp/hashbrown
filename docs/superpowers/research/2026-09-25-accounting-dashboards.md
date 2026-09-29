# Accounting dashboard research: grids, linked charts, matching, AR

Research for the invoicing dashboard redesign, 2026-09-25. Public help centres,
product blogs and docs only. Items marked "secondary" come from third-party
guides or search snippets where the vendor page could not be loaded.

## Most useful patterns

1. **Chart segment filters the grid is the common link.** QuickBooks' Money Bar
   filters the Sales and Customers lists beneath it; FreshBooks, Zoho Books and
   Upflow open the matching invoices when you click an aging amount.
2. **Grid filters drive the chart above it is the closest precedent** for a
   grid-first page. Mercury's Transactions page redraws its cashflow graph from
   the table's filters and saves "Data Views". No product found drives charts
   from a single selected row.
3. **Reconciliation is two panes**: bank line left, suggested match right (Xero,
   green OK). QuickBooks' 2025 feed shows green/blue/orange confidence signals.
4. **One payment, several invoices** is a checkbox list with a running total that
   must tie out (Xero Find & Match, QuickBooks Receive Payment, NetSuite Match Group).
5. **Unapplied cash is a first-class state** (Stripe customer cash balance, Xero
   overpayments/prepayments, QuickBooks unapplied credits, Upflow "unapplied").
6. **Aging buckets are near universal**: Current, 1-30, 31-60, 61-90, 90+, as a
   per-customer summary grid plus an invoice-level detail grid.
7. **Per-customer payment behaviour** is where AR tools (Chaser: avg days to pay,
   oldest debt, payer rating) beat general ledgers.
8. **Multi-currency totals use the home currency**, with records keeping their
   own currency and rate; FreshBooks toggles one currency per widget instead.
9. **Modern grid features are standard**: pinned columns, saved views, bulk-edit
   bars, row-click side panels (Brex, Ramp), inline row expansion (QuickBooks).

## Linked charts

- Chart filters grid (common): QuickBooks Money Bar, FreshBooks aging, Zoho
  Receivables, Upflow aging brackets, Ramp ("every chart is clickable"), Mercury
  Insights (secondary).
- Grid filters chart (rarer): Mercury Transactions.
- Selected row refocuses charts: **not found** in any accounting, banking or AR
  product. Standard in BI tools (Looker, Metabase, Superset cross-filtering).

## Grid candidates

| Grid                                | Typical columns                                                                | Seen in                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Incoming payments / bank feed       | Date, payer, amount + ccy, suggested match, confidence, status, actions        | QuickBooks feed, Xero Reconcile, NetSuite, Mercury      |
| Invoice list                        | Number, client, issued, due, amount, ccy, paid, balance, status, days overdue  | QuickBooks Sales, Stripe Invoices, Xero, Bill.com       |
| Aged receivables by client          | Client, Current, 1-30, 31-60, 61-90, 90+, Total, unapplied                     | Xero, QuickBooks, Stripe, Upflow                        |
| Clients with balances and behaviour | Client, ccy, open, overdue, oldest debt, avg days to pay, last payment, rating | QuickBooks Customers, Chaser, Stripe Customers          |
| Unapplied cash / credits            | Client, received, amount, ccy, remaining, age, suggested invoice               | Stripe, Xero, QuickBooks, Upflow                        |
| Allocation candidates (sub-grid)    | Invoice, due, open, amount to apply, running total, difference                 | QuickBooks Receive Payment, Xero Find & Match, NetSuite |
| Credit notes                        | Number, client, date, amount, applied, remaining                               | Xero, QuickBooks, Stripe                                |
| Recurring invoices / retainers      | Client, schedule, next date, amount, ccy, status                               | Xero, QuickBooks, FreshBooks                            |
| Unbilled time / WIP                 | Client/project, hours, amount                                                  | Zoho Books, FreshBooks                                  |
| Collections activity                | Client, invoice, last reminder, reply, next action                             | Chaser, Xero Tasks                                      |

## Rare or not seen

- Selecting a grid row to refocus charts elsewhere on the page.
- Brushing a chart time range to filter a grid.
- A full data grid as the centre of a home dashboard (home pages use cards and
  short lists; full grids live on task pages).
- Per-currency breakdowns on aging or cash charts.
- Per-client payment behaviour in general ledgers (it lives in AR add-ons).
- Numeric match-confidence scores (only coarse colour signals exist).
- Charts inside a customer detail panel.

## Sources

- Xero homepage: https://blog.xero.com/product-updates/new-xero-homepage/
- QuickBooks dashboard: https://quickbooks.intuit.com/learn-support/en-us/help-article/product-setup/business-dashboard-details-quickbooks-online-app/L46DORrt9_US_en_US
- QuickBooks new banking page: https://quickbooks.intuit.com/learn-support/en-us/help-article/matching-rules/learn-updates-new-ai-powered-banking-page/L0hR7A9Zf_US_en_US
- QuickBooks sales transactions / Money Bar: https://quickbooks.intuit.com/learn-support/en-us/help-article/journal-posting/view-sales-transactions/L2Do6c0jS_US_en_US
- QuickBooks multicurrency: https://quickbooks.intuit.com/learn-support/en-us/help-article/multicurrency/learn-multicurrency-quickbooks-online/L5krkKQi8_US_en_US
- Zoho Books home: https://www.zoho.com/us/books/help/home/
- FreshBooks dashboard: https://support.freshbooks.com/hc/en-us/articles/115015407988-How-do-I-use-my-dashboard
- Stripe invoices: https://docs.stripe.com/invoicing/dashboard/manage-invoices
- Stripe cash balance reconciliation: https://docs.stripe.com/payments/customer-balance/reconciliation
- Stripe AR aging: https://edge-docs.stripe.com/revenue-recognition/reports/accounts-receivable-aging
- Brex accounting page: https://www.brex.com/support/brex-dashboard-accounting-page
- Ramp views: https://support.ramp.com/hc/en-us/articles/29811427309971-Accounting-filters-and-custom-views
- Mercury transactions: https://mercury.com/blog/updated-transactions-page
- NetSuite match suggestions: https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_202608110102.html
- Upflow aging widget: https://docs.upflow.io/en-us/analytics/widgets/aging-balance
- Chaser customer insights: https://help.chaserhq.com/analyze-the-effectiveness-of-chasing-using-the-customer-insights-report
- Xero JAX auto-reconciliation: https://blog.xero.com/product-updates/automatic-bank-reconciliation-jax-beta/
- Cross-filtering (BI): https://docs.cloud.google.com/looker/docs/cross-filtering-dashboards
