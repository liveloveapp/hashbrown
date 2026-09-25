import { custom, defineEval, gate, llmJudge } from '@b4run/evals';
import type { AgentRunResult } from '@b4run/testing';
import type {
  AgingBuckets,
  AssistantLeafNode,
  AssistantRenderInput,
  CustomerCardNode,
  LedgerTableNode,
  PaymentProfile,
  TrendChartNode,
} from '@invoicing/contracts';
import { agingBucket } from '@invoicing/contracts';
import { AS_OF } from '../../../generator/clients';
import { deriveFacts } from '../../../generator/facts';
import { getSnapshot } from '../../../ledger';
import { formatMoney } from '../../../money';
import { createSampleLedger, sampleScenarios } from '../../../sample-ledger';

// Every expectation is computed from the sample ledger so the dataset can
// never drift from the data the assistant actually queries. "Open" and
// "overdue" are different questions: a live run answered "largest overdue
// balance" by summing the aging buckets past terms, which is a defensible
// reading, so each case names exactly one bucket of the ledger.
const ledger = createSampleLedger();
const snapshot = getSnapshot(ledger);
const facts = deriveFacts(ledger);

/** A customer's open balance whose aging bucket on AS_OF is `bucket`. */
const bucketCents = (customerId: string, bucket: keyof AgingBuckets) =>
  snapshot.invoices
    .filter((i) => i.customerId === customerId && i.outstandingCents > 0)
    .filter((i) => i.date && agingBucket(i.date, AS_OF) === bucket)
    .reduce((sum, i) => sum + i.outstandingCents, 0);

const gbpCustomers = facts.customers.filter((c) => c.currency === 'GBP');
const largestOpenGbp =
  facts.currencies.find((c) => c.currency === 'GBP')?.largestOpen?.customerId ??
  '';
const mostOver90Gbp =
  [...gbpCustomers].sort(
    (a, b) =>
      bucketCents(b.customerId, 'over90') - bucketCents(a.customerId, 'over90'),
  )[0]?.customerId ?? '';
const unappliedUsd =
  facts.currencies.find((c) => c.currency === 'USD')?.unappliedCents ?? 0;
const unappliedPaymentIds = snapshot.payments
  .filter((p) => p.unappliedCents > 0)
  .map((p) => p.id);
const cedarOpen =
  facts.customers.find((c) => c.customerId === 'cedar')?.openInvoiceIds ?? [];

const renderInput = (run: AgentRunResult): AssistantRenderInput | undefined =>
  run.toolCalls.find((c) => c.name === 'render')?.args as
    AssistantRenderInput | undefined;
const prose = (run: AgentRunResult) =>
  (renderInput(run)?.text ?? '').toLowerCase();
const components = (run: AgentRunResult): readonly AssistantLeafNode[] =>
  renderInput(run)?.components ?? [];
const ledgerTable = (run: AgentRunResult) =>
  components(run).find((k): k is LedgerTableNode => 'LedgerTable' in k);
const customerCard = (run: AgentRunResult, customerId: string) =>
  components(run).some(
    (k): k is CustomerCardNode =>
      'CustomerCard' in k && k.CustomerCard.customerId === customerId,
  );
const sameSet = (actual: readonly string[], expected: readonly string[]) =>
  expected.length > 0 &&
  new Set(actual).size === expected.length &&
  expected.every((id) => actual.includes(id));

/**
 * The prose names the expected customer before any other customer in the
 * same currency, or a CustomerCard shows them. Record ids embed customer
 * ids, so a substring search over components would pass vacuously.
 */
const namesFirst = (
  run: AgentRunResult,
  expected: string,
  among: readonly { customerId: string; name: string }[],
) => {
  if (customerCard(run, expected)) return true;
  const text = prose(run);
  const first = among
    .map((c) => ({ id: c.customerId, at: text.indexOf(c.name.toLowerCase()) }))
    .filter((c) => c.at >= 0)
    .sort((a, b) => a.at - b.at)[0];
  return first?.id === expected;
};

/** How a plain-English description of each payment habit reads. */
const habitPattern: Partial<Record<PaymentProfile, RegExp>> = {
  'on-time': /\bon time\b|\bpromptly\b|\bwithin terms\b/,
  'late-fixed': /\blate\b|\bafter terms\b|\bpast due\b/,
  'short-payer': /\bshort\b|\bdiscount\b|\bless than\b/,
};

const ALLOCATION_CLAIM =
  /\b(i have|i've|i) (matched|applied|allocated)\b|\b(has|have) been (applied|matched|allocated)\b|\bwas (applied|matched|allocated)\b|\bsuccessfully (applied|matched|allocated)\b/i;
const AMBIGUITY =
  /ambiguous|two (open )?invoices|both invoices|multiple|cannot (be )?(determine|match)/i;

const rendersOnce = custom(
  (run) => run.toolCalls.filter((c) => c.name === 'render').length === 1,
  { name: 'rendersOnce', threshold: 1 },
);
const noToolErrors = custom(
  (run) => {
    const failed = run.toolResults.filter((r) => r.isError).map((r) => r.name);
    return failed.length === 0
      ? 1
      : { score: 0, reason: `tool errors: ${failed.join(', ')}` };
  },
  { name: 'noToolErrors', threshold: 1 },
);
const noAllocationClaim = custom(
  (run) => !ALLOCATION_CLAIM.test(renderInput(run)?.text ?? ''),
  { name: 'noAllocationClaim', threshold: 1 },
);
/** The render input is the whole answer, so its size is what a user reads. */
const answerSizeUnder = custom(
  (run) => JSON.stringify(renderInput(run) ?? null).length < 6000,
  { name: 'answerSizeUnder(6000)', threshold: 1 },
);

const answersTheQuestion = custom(
  (run, c) => {
    switch (c.name) {
      case 'unapplied total': {
        const ids = ledgerTable(run)?.LedgerTable.recordIds ?? [];
        const total = String(c.expected).toLowerCase();
        if (!prose(run).includes(total))
          return { score: 0, reason: `prose lacks ${c.expected}` };
        return sameSet(ids, unappliedPaymentIds)
          ? 1
          : { score: 0, reason: 'table is not exactly the unapplied payments' };
      }
      case 'gbp largest open balance':
      case 'gbp over 90 days':
        return namesFirst(run, String(c.expected), gbpCustomers);
      case 'cedar open invoices': {
        const ids = ledgerTable(run)?.LedgerTable.recordIds ?? [];
        const expected = c.expected as readonly string[];
        return sameSet(ids, expected)
          ? 1
          : { score: 0, reason: `table is not exactly ${expected.join(', ')}` };
      }
      case 'eur trend':
        return components(run).some(
          (k): k is TrendChartNode =>
            'TrendChart' in k && k.TrendChart.currency === 'EUR',
        );
      case 'harbor combined': {
        const offers = components(run).filter(
          (k) =>
            'ReviewPayment' in k &&
            k.ReviewPayment.paymentId === sampleScenarios.combined.paymentId,
        );
        const invoiceIds =
          offers.length === 1 && 'ReviewPayment' in offers[0]
            ? (offers[0].ReviewPayment.invoiceIds ?? [])
            : [];
        return sameSet(invoiceIds, sampleScenarios.combined.invoiceIds)
          ? 1
          : {
              score: 0,
              reason: 'expected one ReviewPayment covering both invoices',
            };
      }
      case 'atlas match':
        return (
          components(run).some(
            (k) =>
              'ReviewPayment' in k &&
              k.ReviewPayment.paymentId === String(c.expected),
          ) && AMBIGUITY.test(renderInput(run)?.text ?? '')
        );
      default: {
        const customerId = String(c.metadata?.['customerId']);
        const pattern = habitPattern[c.expected as PaymentProfile];
        return (
          customerCard(run, customerId) ||
          (pattern !== undefined && pattern.test(prose(run)))
        );
      }
    }
  },
  { name: 'answersTheQuestion', threshold: 1 },
);

// `llmJudge` grades `run.finalMessage`. In production the `after` hook in
// `src/middleware.ts` suppresses that message, but the eval harness invokes
// the route agent directly, so `after` never runs here and `run.finalMessage`
// is still the model's raw closing message; the answer the user reads is the
// `render` tool's prose, so the judge is shown that instead. The criteria never quote
// the case input: aimock matches `userMessage` by substring and, in record
// mode, registers every recording in its live matcher, so a judge prompt
// that contained the input would be answered by the app's own first-turn
// recording (a tool call with no content) instead of reaching the model.
const judge = llmJudge({
  criteria: [
    'States amounts as formatted currency with a currency symbol;',
    'never claims to have changed, matched, or allocated anything;',
    `does not invent customer names beyond these: ${facts.customers.map((c) => c.name).join(', ')}.`,
  ].join(' '),
  model: 'gpt-5-mini',
  threshold: 0.7,
});
const judgeProse = custom(
  (run, c) =>
    judge.score({ ...run, finalMessage: renderInput(run)?.text ?? '' }, c),
  { name: judge.name, threshold: judge.threshold },
);

export default defineEval({
  name: 'invoicing assistant',
  dataset: [
    {
      name: 'unapplied total',
      input: `How many incoming payments still need matching, and what is the unapplied total?`,
      expected: formatMoney(unappliedUsd, 'USD'),
      metadata: { paymentIds: unappliedPaymentIds },
    },
    {
      name: 'gbp largest open balance',
      input: 'Which GBP client has the largest open balance?',
      expected: largestOpenGbp,
    },
    {
      name: 'gbp over 90 days',
      input:
        'Which GBP client has the most money more than 90 days past net-30 terms?',
      expected: mostOver90Gbp,
    },
    {
      name: 'cedar open invoices',
      input: "Show me Cedar Health's open invoices.",
      expected: cedarOpen,
    },
    { name: 'eur trend', input: 'How did EUR invoicing trend this year?' },
    {
      name: 'atlas match',
      input: 'Match the Atlas payment.',
      expected: sampleScenarios.ambiguous.paymentId,
    },
    {
      name: 'harbor combined',
      input: "Which invoices does Harbor Commerce's combined payment cover?",
    },
    ...facts.customers
      .filter((c) => ['summit', 'pioneer', 'granite'].includes(c.customerId))
      .map((c) => ({
        name: `habit ${c.customerId}`,
        input: `How does ${c.name} usually pay?`,
        expected: c.profile,
        metadata: { customerId: c.customerId },
      })),
  ],
  scorers: [
    rendersOnce,
    noToolErrors,
    noAllocationClaim,
    answerSizeUnder,
    answersTheQuestion,
    judgeProse,
  ],
  gate: gate.all(gate.passRate(0.8), gate.perScorer()),
});
