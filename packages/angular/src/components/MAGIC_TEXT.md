Magic Text (Paragraph) — Requirements & Design

1. Summary

Magic Text is a single‑paragraph Angular component that receives text progressively (streaming) and renders it with:
• Bold (**…** or **…**)
• Italics (_…_ or _…_)
• Links with accessible labels (extended Markdown: [label](url 'title'){alt="…", target="\_blank", rel="…"})
• Citations (footnote‑style references [^id] resolved via an input map)

Rendering animates as content arrives, revealing by grapheme clusters using Intl.Segmenter.

The component is semantic, accessible, sanitized, and incremental (handles partial tokens across stream boundaries).

⸻

2. Goals & Non‑Goals

Goals
• Parse and render the specified Markdown subset accurately.
• Work with streaming input, updating formatting when closing markers eventually arrive.
• Animate reveals via grapheme segmentation (emoji, diacritics, etc. remain intact).
• Maintain semantic HTML (<strong>, <em>, <a>, <sup role="doc-noteref">).
• Be accessible (screen readers, keyboard navigation, prefers‑reduced‑motion).
• Sanitize links and attributes to avoid XSS.

Non‑Goals
• Full Markdown implementation (no images, code spans/blocks, blockquotes, tables, etc.).
• Multi‑paragraph layout (this component renders one paragraph).
• Rich math/LaTeX or bibliography management beyond simple citation linking.

⸻

3. Component API (Angular)

This section defines the public API and behavioral contract. Implementation details can vary.

Selector
• app-paragraph (as in the stub) OR app-magic-text-paragraph (recommended).

Inputs
• text: Signal<string> (required)
Streaming paragraph content in the defined Markdown subset.
• citations?: Signal<Record<string, CitationDef> | CitationDef[]> (optional)
Map or array of citation definitions used to resolve [^id] references.
• locale?: string (default: browser locale)
Passed to Intl.Segmenter.
• granularity?: 'grapheme' | 'word' (default: ‘grapheme’)
Controls animation unit.
• revealPunctuationSeparately?: boolean (default: true)
When true, punctuation segments animate as their own fragments.
• animation:

{
enable?: boolean; // default: true
durationMs?: number; // default: 500
staggerMs?: number; // default: 15 (additional delay per fragment)
highlight?: boolean; // background highlight at reveal, default: true
}

    •	linkTarget?: '_self' | '_blank' (default: ‘_blank’)
    •	linkRel?: string (default: ‘noopener noreferrer’)
    •	sanitizeLinks?: boolean (default: true)

Only http:, https:, mailto:, tel: allowed; others dropped.
• features?: { bold?: boolean; italics?: boolean; links?: boolean; citations?: boolean } (all default true)

CitationDef

type CitationDef = {
id: string; // key referenced by [^id]
label?: string | number; // display label (defaults to numeric order)
text?: string; // short description or full citation
href?: string; // external target; if absent, anchor uses #cite-id
tooltip?: string; // optional hover title
};

Outputs (Events)
• linkClicked: (payload: { href: string; label: string; cid?: string }) => void
• citationClicked: (payload: { id: string; label: string | number }) => void
• parseError: (payload: { position: number; reason: string; snapshot: string }) => void
• renderComplete: (payload: { totalFragments: number }) => void
• segmentsRevealed: (payload: { count: number }) => void

Accessibility
• Host may set aria-live="polite" if desired (configurable via a CSS class or attribute).
• Respect prefers-reduced-motion: when enabled, animation duration becomes 0ms, highlight disabled.
• Links may receive aria-label when provided via {alt="…"} in Markdown.

⸻

4. Markdown Subset & Extended Syntax

4.1 Text Emphasis
• Bold:
• **bold** or **bold**
• Italics:
• _italic_ or _italic_

Rules
• Nesting allowed:
• **bold and _italic_ inside**
• _italic and **bold** inside_
• Unclosed markers are treated as plain text until a matching closer appears. When it appears later (streaming), the previously plain text is retroactively emphasized.

4.2 Links (with accessible labels)
• Base: [label](url)
• Optional title: [label](url 'title')
• Extended attributes (IAL‑style) after the link:
[label](url 'title'){alt="Accessible name" target="\_self" rel="nofollow"}
• Supported keys: alt, target, rel.
• alt maps to aria-label on <a>. (Note: alt is not a valid <a> attribute; this maps to aria-label.)
• target and rel override defaults if provided and allowed.
• Empty label + alt is permitted (screen‑reader friendly link):
[](https://example.com){alt="Go to Example"} ⇒ visually minimal, accessible name from alt.

Link Sanitization
• Allowed protocols: http, https, mailto, tel. Others discarded; link rendered as plain text with a console warning via parseError.

4.3 Citations
• Inline reference: [^id]
• id is any alphanumeric/-\_ string.
• Rendered as <sup class="cite" role="doc-noteref"><a ...>[n]</a></sup>.
• Resolution:
• The citations input defines metadata for each id.
• Auto‑numbering: order of first appearance in the paragraph; overridden by label in CitationDef.
• Click behavior:
• If href present, link to it.
• Else link to #cite-id.
• Tooltip precedence: CitationDef.tooltip → CitationDef.text (truncated) → none.

Missing definitions
• If [^id] has no matching CitationDef, render as [?] with data-missing="true" and emit parseError.

4.4 Escaping
• \*, \_, \[, \], \(, \), \\, \^ escape the next char.
• Escapes apply inside or outside formatting.

4.5 Delimiters & Ambiguity
• Emphasis delimiters follow CommonMark‑style intent:
• No emphasis across whitespace‑only content.
• Single _/* toggles italics; double toggles bold; triple not supported (treated as bold + literal * or _).
• Links cannot be nested. Emphasis inside link label is allowed (rendered as formatting inside <a>).

⸻

5. Rendering Model

5.1 Node Types (AST)
• Text — raw text
• Strong — children nodes
• Emphasis — children nodes
• Link — attributes: href, title?, ariaLabel?, target?, rel?; children nodes
• Citation — attributes: id, label, href?, tooltip? (no children; label is the superscript content)

5.2 DOM Semantics
• Emphasis:

<strong>…</strong> / <em>…</em>

    •	Link:

<a href="…" title="…" aria-label="…" target="_blank" rel="noopener noreferrer">…</a>

    •	Citation:

<sup class="cite" role="doc-noteref">
  <a href="…" title="…">[1]</a>
</sup>

5.3 Animation Units
• Grapheme segments inside each textual node are wrapped with inline <span class="frag">…</span> and animated on insertion.
• Semantic containers (<strong>, <em>, <a>) wrap these fragments without interfering with per‑grapheme spans.

⸻

6. Streaming & Incremental Parsing

Key requirement: Parsing must be robust to partial tokens arriving over time.

6.1 State Machine (high level)

States maintain stacks and partials:
• Normal
• EmphasisOpen('\*' | '\_', count=1|2) // italic or bold
• LinkLabel (within […], nesting of emphasis allowed)
• LinkDest (within (…))
• LinkTitle (within quotes inside (…))
• LinkAttrs (within {…} after link)
• CitationOpen (after [^)
• EscapeNext

The parser:
• Accepts delta (appended substring) and updates internal buffers.
• Does not emit emphasis/link/citation nodes until their closers are confirmed.
• When a closer arrives later, it rebuilds the affected slice and emits a minimal diff of fragments. (Implementation may rely on stable fragment IDs to prevent re‑animation of pre‑existing graphemes.)

6.2 Fragment Identity & Reconciliation
• Each revealed grapheme gets a stable id composed of:
• Source index range (start,end) in the raw string
• A monotonic rev if the semantic wrapper changes (e.g., text becomes bold after closure).
• trackBy: fragment.id ensures only new graphemes animate. Semantic container changes should not force re‑insertion of leaf spans if possible.

6.3 Error Recovery
• Unmatched closers (e.g., stray )) are treated as literals and flagged via parseError.
• Unterminated link attribute list {… at end of stream remains pending; if never closed by component destroy, it’s dropped, literalized.

⸻

7. Animation Requirements

7.1 Defaults
• Use Intl.Segmenter(locale, { granularity }) with default 'grapheme'.
• Each fragment enters with:
• opacity: 0 → 1
• Optional background highlight (e.g., var(--magic-text-highlight, rgba(0,0,0,.06))) fading to transparent.
• Timing:
• durationMs for each fragment’s transition.
• Additional stagger delay per fragment in natural order within the paragraph.
• Punctuation handling (revealPunctuationSeparately):
• When true, punctuation is its own fragment and thus participates in stagger for a pleasant cadence.

7.2 Reduced Motion
• When @media (prefers-reduced-motion: reduce), or when animation.enable === false:
• No opacity transition, no highlight.
• Content appears immediately.

⸻

8. Accessibility
   • By default the host paragraph does not use aria-live (to avoid over‑announcing). Allow an opt‑in host class (e.g., .live) setting aria-live="polite".
   • Links:
   • aria-label from {alt="…"}; otherwise the link text is the accessible name.
   • title attribute from Markdown title if present.
   • Citations:
   • <sup role="doc-noteref"> with link text [n].
   • Tooltip may use title.
   • Keyboard:
   • Links and citations are tabbable like normal anchors.
   • Contrast:
   • Highlight color customizable via CSS variable; must meet contrast guidelines if used in solid form.

⸻

9. Security & Sanitization
   • All links are sanitized. Disallowed protocols result in:
   • Rendering the original Markdown literally (not as a link).
   • Emitting parseError.
   • rel defaults to 'noopener noreferrer' when target="\_blank".
   • No innerHTML for untrusted content; nodes are created via Angular templates from the parsed AST/fragment model.

⸻

10. Internationalization & RTL
    • locale input drives Intl.Segmenter. Fallback to 'en' if not available.
    • Support RTL text:
    • Do not reorder fragments manually; rely on the browser’s bidi handling.
    • Ensure spans do not break grapheme semantics (Segmenter handles this).
    • Emoji & combining marks are preserved as single graphemes.

⸻

11. Performance Expectations
    • Target: ≤ 2 ms parse time per 200 chars on modern desktop; ≤ 8 ms on mobile mid‑range.
    • Avoid full re‑parses: operate on deltas where feasible; however, semantic updates may require slice rebuild.
    • Fragment count cap: soft limit 5,000 fragments per paragraph; beyond that, switch to word granularity automatically to avoid DOM bloat (configurable).

⸻

12. Failure Modes & Logging
    • Emit parseError for:
    • Unknown link attribute keys in {…}
    • Disallowed link protocols
    • Missing citation definitions
    • Unterminated constructs on destroy
    • Degrade gracefully by literalizing the invalid token.

⸻

13. Styling & Theming
    • Host CSS variables:
    • --magic-text-highlight (default translucent highlight)
    • --magic-text-duration (ms)
    • --magic-text-stagger (ms)
    • --article-width (already present in stub)
    • Provide minimal built‑in styles; allow consumer override.

⸻

14. Integration Notes (with existing stub)
    • Replace flat fragments: Fragment[] with structured nodes that support nesting:

type Fragment = {
id: string; // stable across stream
text?: string; // leaf text when present
kind: 'text'|'strong'|'em'|'link'|'citation';
children?: Fragment[]; // for containers
attrs?: { href?: string; title?: string; ariaLabel?: string; target?: string; rel?: string; id?: string; label?: string|number; };
isPunct?: boolean;
isWord?: boolean;
}

    •	Template renders semantic wrappers (strong, em, a, sup) and inside each, iterates child grapheme fragments (<span class="frag">…</span>).
    •	trackBy uses fragment.id.

⸻

15. Samples (Input → Rendering)

Each sample assumes defaults: granularity='grapheme', punctuation separate, link target \_blank.

15.1 Simple Bold & Italic

Input

We love **Angular** and _Segmenter_.

Rendered semantics

<p class="magic-text">
  We love <strong>Angular</strong> and <em>Segmenter</em>.
</p>

15.2 Nested Emphasis

Input

**Bold with _italic_ inside** and _italic with **bold** inside_.

Rendered

<p>
  <strong>Bold with <em>italic</em> inside</strong> and <em>italic with <strong>bold</strong> inside</em>.
</p>

15.3 Link (basic)

Input

Read [the docs](https://developer.mozilla.org/ 'MDN').

Rendered

<p>
  Read <a href="https://developer.mozilla.org/" title="MDN" target="_blank" rel="noopener noreferrer">the docs</a>.
</p>

15.4 Link with accessible label (alt)

Input

See [MDN](https://developer.mozilla.org/ 'MDN Homepage'){alt="Mozilla Developer Network"}.

Rendered

<p>
  See <a href="https://developer.mozilla.org/" title="MDN Homepage" aria-label="Mozilla Developer Network" target="_blank" rel="noopener noreferrer">MDN</a>.
</p>

15.5 Empty label, alt only

Input

[](https://example.com){alt="Visit Example"} now.

Rendered

<p>
  <a href="https://example.com" aria-label="Visit Example" target="_blank" rel="noopener noreferrer"></a> now.
</p>

(Note: visually empty link—acceptable if paired with surrounding context; consider styling to show an icon if desired.)

15.6 Citation (external href)

Inputs
• Text:

The method is described by Doe [^doe2020].

    •	Citations:

{
doe2020: { id: 'doe2020', text: 'Doe, J. (2020). Magic Text.', href: 'https://doi.org/10.1234/doe.2020' }
}

Rendered

<p>
  The method is described by Doe <sup class="cite" role="doc-noteref">
    <a href="https://doi.org/10.1234/doe.2020" title="Doe, J. (2020). Magic Text.">[1]</a>
  </sup>.
</p>

15.7 Citation (no href → fragment link)

Inputs
• Text: As shown earlier [^smith].
• Citations: { smith: { id: 'smith', text: 'Smith (2019) Internal memo.' } }
Rendered

<p>
  As shown earlier <sup class="cite" role="doc-noteref"><a href="#cite-smith" title="Smith (2019) Internal memo.">[1]</a></sup>.
</p>

15.8 Mixed Emphasis inside Link Label

Input

Check [**bold** and _italics_](https://example.com){alt="Styled link"}.

Rendered

<p>
  Check <a href="https://example.com" aria-label="Styled link" target="_blank" rel="noopener noreferrer"><strong>bold</strong> and <em>italics</em></a>.
</p>

15.9 Escapes

Input

Treat \*these\* literally. Show \[brackets\] and \(parens\).

Rendered

<p>
  Treat *these* literally. Show [brackets] and (parens).
</p>

15.10 Disallowed Link Protocol (literalize + error)

Input

Avoid [bad](<javascript:alert(1)>).

Rendered

<p>
  Avoid [bad](javascript:alert(1)).
</p>

Behavior
• Emit parseError with reason "disallowed_protocol".

15.11 Streaming: delayed bold closure

Stream chunks 1. "We love **Ang" 2. "ular** and Segmenter."
Intermediate render after #1

We love \*\*Ang

(Visible as plain text; no bold yet.)
Render after #2

We love <strong>Angular</strong> and Segmenter.

Behavior
• Previously rendered “Ang” becomes bold once \*\* closer arrives.
• Existing grapheme spans maintain IDs; only newly inserted graphemes animate.

15.12 Streaming: link arriving in parts

Chunks 1. "See [MDN](" 2. "https://developer.mozilla.org/" 3. "){alt=\"Mozilla\"} now."
Final render

<p>
  See <a href="https://developer.mozilla.org/" aria-label="Mozilla" target="_blank" rel="noopener noreferrer">MDN</a> now.
</p>

⸻

16. Acceptance Criteria
    1.  Formatting
        • Bold/italics render correctly, including nested combinations.
        • Link syntax supports title and IAL {alt, target, rel}; invalid keys ignored with warning.
        • Citations render as superscripts with correct numbering and link behavior.
    2.  Streaming
        • Partial tokens render as literal text until closed; on closure, formatting updates without re‑announcing entire paragraph (no wholesale reinsertions).
        • New content animates; previously revealed content does not re‑animate unless its node is replaced.
    3.  Animation
        • Grapheme‑accurate segmentation; emojis and combined characters never split.
        • Stagger applied in reading order; punctuation respects revealPunctuationSeparately.
    4.  Accessibility
        • prefers-reduced-motion honored.
        • Link accessible names behave as defined.
        • Citations have role="doc-noteref".
    5.  Security
        • Disallowed protocols never become clickable links.
        • \_blank implies rel="noopener noreferrer" by default.
    6.  Performance
        • Under the performance budget for paragraphs ≤ 1,000 characters on target devices.

⸻

17. Test Matrix (suggested)

Case Input Expectation
Bold basic **b** <strong>b</strong>
Italic underscores _i_ <em>i</em>
Nesting **b _i_** <strong>b <em>i</em></strong>
Link base [x](https://x) <a href=…>x</a>
Link title [x](https://x 't') title="t"
Link IAL alt [x](https://x){alt="A"} aria-label="A"
Link IAL target/rel {target="\_self" rel="nofollow"} attributes applied
Bad attr key {foo="bar"} literalized or attrs ignored + parseError
Citation mapped [^a] + { a: {...} } [1] sup rendered
Citation missing [^a] + {} [?] + parseError
Escape \* literal \*
Bad protocol (javascript:…) literalized + parseError
Streaming open **bo literal **bo
Streaming close later ld\*\* retroactive <strong>bold</strong>

⸻

18. Open Questions (defaults you may choose now)
    • Should unclosed emphasis at unmount be auto‑closed (and thus emphasized)? Recommendation: No; treat as literal.
    • Should link titles be mirrored to aria-label when {alt} absent? Recommendation: No; keep aria-label only when explicit.
    • Should we auto‑number citations starting from 1 per paragraph or accept an external base? Recommendation: Per paragraph, starting at 1.

⸻

19. Future Enhancements (non‑requirements)
    • Word vs sentence reveal modes.
    • Sidenotes/footnote list outlet component fed by citations actually used in the paragraph.
    • Code span `inline code` support with monospace and no animation on punctuation inside.
    • Hover preview for citations with CitationDef.text.

⸻

20. Developer Notes (Implementation Tips, no hard requirements)
    • Prefer building an AST then performing segmentation at the leaves to avoid splitting semantic tags.
    • Use a small rope‑like buffer or diff strategy to detect append‑only deltas for streaming; compute LCP (longest common prefix) with previous text() to isolate the delta.
    • Maintain a formatting stack with markers { type: 'em'|'strong', delimiter: '\*'|'\_', pos } to handle nested emphasis robustly.
    • For IAL parsing, accept unquoted barewords for simple flags (optional), but only document quoted strings to reduce ambiguity.
    • Provide a dev mode flag to render invisible delimiters positions (useful for debugging).
