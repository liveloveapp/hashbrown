# Magic Text Core — Headless Streaming Parser (v1)

1. Summary
   • What it does: Parses a small, well‑defined Markdown subset into fragments with stable IDs so renderers can map to DOM (or anything else) however they like.
   • Subset: Bold, Italics, Links (with title + {alt, target, rel} attribute list), Citations ([^id]).
   • Headless: No DOM, no CSS, no animation. Just data.
   • Streaming: Input is append‑only. The parser must return provisional fragments while constructs are still open (e.g., unmatched \*\*), and later finalize them when the closer arrives—without changing fragment IDs for the same text.

⸻

2. Goals & Non‑Goals

Goals
• Deterministic, side‑effect‑free transformation: result = parseMagicText(input, options).
• Stable fragment IDs across calls as the input grows.
• Handle unclosed/partial tokens by marking fragments as provisional and retroactively finalizing styles when closers appear.
• Provide enough metadata to render semantic HTML (or anything else): strong, em, link, citation.
• Provide link policy controls (sanitize/allow/rewrite).
• Provide citation numbering and a way to detect missing definitions.

Non‑Goals
• Full Markdown (no images, code blocks/spans, lists, tables, blockquotes).
• Multi‑paragraph parsing (this spec covers a single paragraph string per call).
• Edit‑anywhere text. Model is append‑only between calls (earlier content may change semantics but not bytes/characters).

⸻

3. Supported Markdown Subset

3.1 Emphasis
• Bold: **bold** or **bold**
• Italics: _italic_ or _italic_
• Nesting allowed: **b _i_**, _i **b** i_
• Escapes: \* \_ \\ etc. make the next char literal.
• Unclosed markers are treated as provisional literal text until a matching closer appears later.

3.2 Links (+ extended attributes)
• Basic: [label](https://example.com)
• Optional title: [label](https://example.com 'Title')
• Attribute list immediately following:
[label](https://x 'T'){alt="Accessible", target="\_self", rel="nofollow"}
• Recognized keys: alt (→ ariaLabel), target, rel.
• Unknown keys preserved in a unknownAttrs bag (and trigger a warning).
• Label may include emphasis formatting.
• Empty label allowed: [](https://example.com){alt="Go"} → accessible name comes from alt.

3.3 Citations
• Inline reference: [^id] where id is [A-Za-z0-9_-]+.
• Numbered in order of first occurrence during a call. Numbers are stable across calls as long as earlier occurrences don’t change.
• Resolved against options.citations (map or array). Missing IDs yield a warning and are marked missing: true.

3.4 Escaping
• Standard backslash escapes for \* \_ [ ] ( ) { } ^ \.
• Escapes work inside/outside emphasis and link labels.

⸻

4. Function API

export type ParseOptions = {
// Link policy & sanitization
allowedProtocols?: readonly string[]; // default: ['http:', 'https:', 'mailto:', 'tel:']
linkPolicy?: 'sanitize' | 'passthrough' | ((href: string) =>
| 'allow'
| 'drop'
| { href: string; rel?: string; target?: string });

// Citations
citations?: Record<string, CitationDef> | CitationDef[];
citationNumberingBase?: number; // default: 1

// Output granularity
unit?: 'run' | 'grapheme' | 'word'; // default: 'run'

// Text segmentation (only used when unit !== 'run')
segmenter?:
| Intl.Segmenter
| ((text: string, unit: 'grapheme' | 'word') => Iterable<Segment>);

// Emphasis rules
emphasisIntraword?: boolean; // default: true (CommonMark-like)

// Misc
schemaVersion?: 1; // for forward-compat checks
};

export type CitationDef = {
id: string;
label?: string | number; // overrides numbering
text?: string; // tooltip/description
href?: string; // external URL; if absent, renderers may use "#cite-id"
tooltip?: string; // explicit tooltip
};

export type Segment = { segment: string; index: number; isWordLike?: boolean };

Signature

export function parseMagicText(
input: string,
options?: ParseOptions
): MagicParseResult;

Return Type

export type MagicParseResult = {
fragments: Fragment[]; // ordered left-to-right
warnings: ParseWarning[]; // recoverable issues
meta: {
citationOrder: string[]; // id[] in first-appearance order
citationNumbers: Record<string, number | string>; // id -> ordinal or label
stats: { chars: number; runs: number; fragments: number };
};
};

⸻

5. Fragment Model

Fragments describe what to render, not how. They are designed to be stable across calls as input grows.

export type Fragment =
| TextFragment
| CitationFragment;

export type BaseFragment = {
/** Stable across calls for the same text range, even if marks change later \*/
id: string; // e.g., "g:72" (grapheme) or "r:24-37" (run)
/** UTF-16 source range in the current input (inclusive, exclusive) _/
range: { start: number; end: number };
/\*\* Whether the styling of this fragment may change on future calls _/
state: 'final' | 'provisional';
/\*_ Incremented when the same text’s marks change (e.g., emphasis finally closes) _/
rev: number; // starts at 0
};

export type MarkSet = {
strong?: true;
em?: true;
link?: {
href: string; // sanitized or rewritten
title?: string;
ariaLabel?: string;
target?: '\_self' | '\_blank' | string;
rel?: string;
unknownAttrs?: Record<string, string>;
policy: 'allowed' | 'dropped' | 'rewritten'; // result from linkPolicy
};
};

export type TextFragment = BaseFragment & {
kind: 'text';
text: string; // already segmented per 'unit'
marks: MarkSet; // emphasis + link applied
};

export type CitationFragment = BaseFragment & {
kind: 'citation';
citation: {
id: string;
number: number | string; // resolved ordinal or explicit label
missing?: boolean;
href?: string; // from CitationDef or '#cite-id'
title?: string; // tooltip hint
};
/\*_ Renderers typically show text like "[1]" _/
text: string; // provided for convenience, e.g., "[1]"
marks: {}; // citations are atomic, not styled
};

Fragment Identity & Stability
• Append‑only model: input only grows at the end between calls.
• IDs are derived from source positions:
• unit: 'grapheme' | 'word' → base ID per segment start: g:<start> / w:<start>
• unit: 'run' → base ID per contiguous run with identical marks: r:<start>-<end>
• When a closer arrives later (e.g., \*\*), text is not re‑segmented; instead:
• The same fragment IDs stay, but their marks get updated and rev increments.
• If the output unit is 'run', runs may split/merge; new run IDs will appear for changed regions. Consumers that need per‑character stability should use 'grapheme'.
• state
• provisional — a fragment’s marks may change when an open construct closes.
• final — semantics for this slice will not change (though later text can still be appended after it).

⸻

6. Warnings (non‑fatal)

export type ParseWarning =
| { code: 'unknown_link_attr'; key: string; range: [number, number] }
| { code: 'disallowed_protocol'; href: string; range: [number, number] }
| { code: 'missing_citation'; id: string; range: [number, number] }
| { code: 'unmatched_closer'; token: string; range: [number, number] }
| { code: 'unterminated_construct'; kind: 'em'|'strong'|'link'|'citation'|'attrs'|'title'; at: number };

⸻

7. Link Policy & Sanitization
   • Default allowedProtocols: http:, https:, mailto:, tel:.
   • linkPolicy:
   • 'sanitize' (default): If href protocol not allowed → fragment remains text (no link mark), issue warning.
   • 'passthrough': No changes (still record href).
   • Custom function: Return 'allow' | 'drop' | { href, rel?, target? }.
   • 'drop': treat as plain text; warning disallowed_protocol.
   • Object: marks with policy: 'rewritten'.

⸻

8. Streaming Semantics

8.1 Provisional → Final
• Emphasis
• Input: "We love **Ang" → the ** + Ang region remains provisional (treated as literal text).
• Later: "ular\*\* and more" → previous fragments covering "Angular" keep their IDs; marks.strong=true and rev++.
• state for those fragments flips to final.
• Links
• Until a complete [label](dest) (with balanced () and optional "title" and {attrs}) occurs, the bracketed content remains literal, state: provisional.
• After closure: marks.link applied to the label’s fragments; those fragment IDs remain stable (unless unit: 'run' triggers re‑runs).
• Citations
• [^id (missing ]) remains literal provisional text.
• On ], produce a CitationFragment at that position with a stable ID; numbering is based on first appearance order observed in that call.

8.2 Unterminated at End of Stream
• The parser returns literal provisional fragments for any open constructs and includes an unterminated_construct warning.

⸻

9. Output Granularity
   • unit: 'run' (default for efficiency)
   • Output minimal fragments where adjacent characters share identical marks.
   • IDs format: r:start-end
   • Best when consumers render block‑level nodes or wrap runs in <strong>, <em>, <a>.
   • unit: 'grapheme'
   • Output one fragment per grapheme cluster (emoji‑safe).
   • IDs format: g:start
   • Best for fine‑grained transitions/animations (left to the consumer).
   • unit: 'word'
   • Output one fragment per word (using the provided or built‑in segmenter).

⸻

10. Examples

10.1 Basic Emphasis (one shot)

Input

We love **Angular** and _Segmenter_.

Options

{ unit: 'run' }

Fragments (simplified)

[
{"id":"r:0-8","kind":"text","text":"We love ","marks":{},"range":{"start":0,"end":8},"state":"final","rev":0},
{"id":"r:8-18","kind":"text","text":"Angular","marks":{"strong":true},"range":{"start":8,"end":15},"state":"final","rev":0},
{"id":"r:18-23","kind":"text","text":" and ","marks":{},"range":{"start":15,"end":20},"state":"final","rev":0},
{"id":"r:23-32","kind":"text","text":"Segmenter","marks":{"em":true},"range":{"start":20,"end":29},"state":"final","rev":0},
{"id":"r:32-33","kind":"text","text":".","marks":{},"range":{"start":29,"end":30},"state":"final","rev":0}
]

(Indices above assume delimiters are not included in the output text; the parser consumes them.)

10.2 Streaming Emphasis (two calls)

Call #1 — Input

We love \*\*Ang

Result (selected)

[
{"id":"r:0-8","text":"We love ","marks":{},"state":"final","rev":0},
{"id":"r:8-13","text":"**Ang","marks":{},"state":"provisional","rev":0} // literal so far
]

Call #2 — Input

We love **Angular** and more

Result (selected)

[
{"id":"r:0-8","text":"We love ","marks":{},"state":"final","rev":0},
{"id":"r:8-15","text":"Angular","marks":{"strong":true},"state":"final","rev":1}, // same text region; now bold
{"id":"r:15-24","text":" and more","marks":{},"state":"final","rev":0}
]

10.3 Link with Title & Attrs

Input

Check [**bold** and _italics_](https://example.com 'T'){alt="Styled link"}!

Options

{ unit: 'grapheme' }

Result (outline)
• Grapheme fragments for Check , ! (no marks).
• Grapheme fragments for bold with marks.strong=true.
• Grapheme fragments for and, italics with marks.em=true.
• All label graphemes include marks.link = { href:'https://example.com', title:'T', ariaLabel:'Styled link', target:'\_blank', rel:'noopener noreferrer', policy:'allowed' }.

10.4 Disallowed Protocol (sanitized)

Input

Avoid [bad](<javascript:alert(1)>).

Options (default sanitization)

{}

Result
• The label bad is emitted as plain text fragments (no marks.link), and a warning:

{ "code":"disallowed_protocol", "href":"javascript:alert(1)", "range":[7,28] }

10.5 Citations (numbering & missing)

Input

Method A [^doe2020] improves upon B [^smith].

Citations

{
doe2020: { id: 'doe2020', text: 'Doe 2020, Journal...', href: 'https://doi.org/...' }
// smith missing
}

Result (selected)

[
{"kind":"text","id":"r:0-9","text":"Method A ","marks":{},"state":"final","rev":0},
{"kind":"citation","id":"r:9-19","text":"[1]","citation":{"id":"doe2020","number":1,"href":"https://doi.org/...","title":"Doe 2020, Journal..."},"state":"final","rev":0},
{"kind":"text","id":"r:19-31","text":" improves upon B ","marks":{},"state":"final","rev":0},
{"kind":"citation","id":"r:31-39","text":"[2]","citation":{"id":"smith","number":2,"missing":true,"href":"#cite-smith"},"state":"final","rev":0}
]

Meta

{
"citationOrder": ["doe2020","smith"],
"citationNumbers": { "doe2020": 1, "smith": 2 }
}

Warnings

[{ "code":"missing_citation", "id":"smith", "range":[31,39] }]

10.6 Streaming Link (three calls) 1. "See [MDN]("
Result: the substring "[MDN](" remains provisional literal (no link mark) with a warning unterminated_construct { kind: 'link' }. 2. "... https://developer.mozilla.org/"
Still provisional (no closing )). 3. "... ) {alt=\"Mozilla\"} now."
Label graphemes for MDN keep their IDs; marks.link is applied with ariaLabel: "Mozilla", rev++, state: final.

⸻

11. Performance Targets
    • ≤ 2 ms per 200 chars on modern desktop, ≤ 8 ms on mid‑range mobile (unit=‘run’).
    • Avoid quadratic behavior: single pass tokenizer + small backtracking for open constructs.
    • Memory proportional to input length; no retained global state.

⸻

12. Implementation Notes (guidance, not prescriptive)
    1.  Tokenizer with state machine
        • States: Normal, EmphasisOpen (\*|\_, count 1/2), LinkLabel, LinkDest, LinkTitle, LinkAttrs, CitationOpen, Escape.
        • Maintain a stack of open marks; do not emit styled fragments until closure is confirmed.
    2.  Append‑only assumption
        • Compute longest common prefix (LCP) with previous input if you choose to optimize, but the public API remains pure (stateless). Caching is optional and out of scope.
    3.  Provisional emission
        • Emit literal fragments for open constructs with state: 'provisional'.
        • When a closer is later found, recompute the affected slice and preserve IDs:
        • For unit='grapheme'|'word': ID is g:<start>/w:<start> — unchanged.
        • For unit='run': re‑run segmentation may change IDs in the modified region only.
        • Increment rev for fragments whose marks changed.
    4.  Segmentation
        • If segmenter not provided:
        • 'grapheme': use new Intl.Segmenter(locale, { granularity:'grapheme' }) when available; otherwise a conservative fallback (treat code points as graphemes).
        • 'word': Intl.Segmenter(..., { granularity:'word' }) or simple regex fallback.
    5.  Citations
        • Build citationOrder while scanning left to right. Respect CitationDef.label when present (string/number).
        • For tooltip/title choose: CitationDef.tooltip → CitationDef.text (truncated) → undefined.
    6.  Link attributes
        • Parse { key="value", key2='value2' } with quotes required in this version.
        • Normalize whitespace; unknown keys → unknownAttrs + unknown_link_attr warning.
    7.  Escaping
        • A backslash outside code contexts escapes the next char verbatim.
    8.  Ranges
        • range.start/end are UTF‑16 indices into input (like JS). Renderers can re‑map if they need code points.

⸻

13. Usage Patterns

Angular (signals)

const result = computed(() => parseMagicText(text(), {
unit: 'grapheme',
citations,
}));

// Template idea (example only)
@for (f of result().fragments; track f.id) {

  <!-- Use f.kind, f.text, f.marks, f.state to choose element -->

}

React

const parsed = useMemo(
() => parseMagicText(text, { unit: 'run', citations }),
[text, citationsKey]
);

// Render runs and wrap with <strong>/<em>/<a>… based on f.marks

Keying advice
• If you want maximal stability, set unit: 'grapheme' and key by f.id.
• Use f.rev to detect style changes without changing keys.
• Use f.state === 'provisional' to e.g. render as literal text or a different style until finalized.

⸻

14. Acceptance Criteria
    1.  Headless: No DOM/CSS/animation in the core function.
    2.  Streaming‑safe: For append‑only inputs, previously returned fragments for the same characters keep their id; only their marks and rev may change when constructs close.
    3.  Coverage: Bold, italics, links (title + {alt,target,rel}), citations, escapes.
    4.  Sanitization: Disallowed link protocols do not produce marks.link; warnings are emitted.
    5.  Citations: Numbering and missing IDs handled as specified; metadata returned.
    6.  Performance: Meets targets for typical paragraph lengths (≤1k chars).

⸻

15. Test Matrix (selected)

Case Input Options Expect
Bold basic **b** {unit:'run'} single run with marks.strong
Italic underscore _i_ {} single run with marks.em
Nested **b _i_** {} inner run has em, outer has strong
Unclosed bold (provisional) **bo {} literal provisional run; warning unterminated_construct: em/strong
Close later **bo → **bold** {} same IDs, rev++, marks.strong=true
Link basic [x](https://x) {} run with marks.link.href
Link + title + attrs [x](https://x 'T'){alt="A"} {} title, ariaLabel surfaced
Disallowed protocol [x](javascript:1) {} plain text + warning
Citation ok [^a] + defs {} CitationFragment with number 1
Citation missing [^a] + {} {} missing: true + warning
Escapes \*text\* {} literal _text_

⸻

16. Open Defaults (chosen)
    • unit: 'run'
    • emphasisIntraword: true
    • allowedProtocols: ['http:', 'https:', 'mailto:', 'tel:']
    • linkPolicy: 'sanitize'
    • citationNumberingBase: 1

⸻

17. Deliverables
    • parseMagicText(input: string, options?: ParseOptions): MagicParseResult
    • TypeScript type definitions for all types above.
    • A conformance test suite covering the Test Matrix and Examples.
