import { custom, defineEval, gate, llmJudge, tokensUnder } from '@b4run/evals';
import type { AgentRunResult } from '@b4run/testing';
import type {
  AgingBuckets,
  AssistantLeafNode,
  AssistantRenderInput,
  LedgerTableNode,
  PaymentProfile,
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
const unappliedCount = snapshot.payments.filter(
  (p) => p.unappliedCents > 0,
).length;
const cedarOpen =
  facts.customers.find((c) => c.customerId === 'cedar')?.openInvoiceIds ?? [];
const nameOf = (id: string) =>
  facts.customers.find((c) => c.customerId === id)?.name.toLowerCase() ?? id;

const renderInput = (run: AgentRunResult): AssistantRenderInput | undefined =>
  run.toolCalls.find((c) => c.name === 'render')?.args as
    AssistantRenderInput | undefined;
const prose = (run: AgentRunResult) =>
  (renderInput(run)?.text ?? '').toLowerCase();
const components = (run: AgentRunResult): readonly AssistantLeafNode[] =>
  renderInput(run)?.components ?? [];
const has = (run: AgentRunResult, name: string) =>
  components(run).some((c) => Object.keys(c)[0] === name);
const componentsJson = (run: AgentRunResult) => JSON.stringify(components(run));
const mentions = (run: AgentRunResult, customerId: string) =>
  prose(run).includes(nameOf(customerId)) ||
  componentsJson(run).includes(customerId);

const COUNT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];

/** Words a plain-English description of each payment habit would use. */
const habitWords: Partial<Record<PaymentProfile, readonly string[]>> = {
  'on-time': ['on time', 'promptly', 'within terms', 'reliabl'],
  'late-fixed': ['late', 'after terms', 'days after', 'past due'],
  'short-payer': ['short', 'less than', 'discount', 'underpay'],
};

const rendersOnce = custom(
  (run) => run.toolCalls.filter((c) => c.name === 'render').length === 1,
  { name: 'rendersOnce', threshold: 1 },
);
const endsWithEmptyUi = custom(
  (run) => run.finalMessage.trim() === '{"ui":[]}',
  { name: 'endsWithEmptyUi', threshold: 1 },
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
  (run) => !/\b(i have|i've|i) (matched|applied|allocated)\b/i.test(prose(run)),
  { name: 'noAllocationClaim', threshold: 1 },
);

const answersTheQuestion = custom(
  (run, c) => {
    switch (c.name) {
      case 'unapplied total': {
        const count = Number(c.metadata?.['paymentCount']);
        const countWords = [String(count), COUNT_WORDS[count] ?? ''].filter(
          Boolean,
        );
        return (
          prose(run).includes(String(c.expected).toLowerCase()) &&
          new RegExp(`\\b(${countWords.join('|')})\\b`).test(prose(run))
        );
      }
      case 'gbp largest open balance':
      case 'gbp over 90 days':
        return mentions(run, String(c.expected));
      case 'cedar open invoices': {
        const table = components(run).find(
          (k): k is LedgerTableNode => 'LedgerTable' in k,
        );
        const ids = new Set(table?.LedgerTable.recordIds ?? []);
        const missing = (c.expected as readonly string[]).filter(
          (id) => !ids.has(id),
        );
        return missing.length === 0
          ? 1
          : { score: 0, reason: `table lacks ${missing.join(', ')}` };
      }
      case 'eur trend':
        return has(run, 'TrendChart');
      case 'atlas match':
        return (
          has(run, 'ReviewPayment') &&
          componentsJson(run).includes(String(c.expected)) &&
          prose(run).includes('ambiguous')
        );
      default: {
        const profile = c.expected as PaymentProfile;
        const words = habitWords[profile] ?? [profile];
        return (
          words.some((w) => prose(run).includes(w)) || has(run, 'CustomerCard')
        );
      }
    }
  },
  { name: 'answersTheQuestion', threshold: 1 },
);

// `llmJudge` grades `run.finalMessage`, which for this app is always the
// model's closing `{"ui":[]}`; the answer the user reads is the `render`
// tool's prose, so the judge is shown that instead.
const judge = llmJudge({
  criteria:
    'The answer states amounts as formatted currency, cites only figures that could come from the ledger, and never claims to have changed, matched or allocated anything. Input: {{input}}. Output: {{output}}',
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
      metadata: { paymentCount: unappliedCount },
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
    ...facts.customers
      .filter((c) => ['summit', 'pioneer', 'granite'].includes(c.customerId))
      .map((c) => ({
        name: `habit ${c.customerId}`,
        input: `How does ${c.name} usually pay?`,
        expected: c.profile,
      })),
  ],
  scorers: [
    rendersOnce,
    endsWithEmptyUi,
    noToolErrors,
    noAllocationClaim,
    tokensUnder(4000),
    answersTheQuestion,
    judgeProse,
  ],
  gate: gate.all(gate.passRate(0.8), gate.perScorer()),
});
