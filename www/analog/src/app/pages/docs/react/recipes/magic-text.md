---
title: 'Streaming Inline Markdown in React (Streamdown): Hashbrown React Docs'
meta:
  - name: description
    content: 'React does not ship Magic Text yet. Use Streamdown as a streaming-safe Markdown renderer alongside Hashbrown chat hooks.'
---
# Streaming Inline Markdown in React (Streamdown)

<p class="subtitle">Magic Text is not available in the React SDK yet. Until it lands, use <strong>Streamdown</strong> as your streaming Markdown renderer.</p>

---

## 0) Why Streamdown instead of Magic Text?

Hashbrown’s React SDK does not include Magic Text today. Streamdown is a drop-in replacement for `react-markdown` that is purpose-built for AI streaming: it handles incomplete Markdown tokens, keeps output safe, and ships performance optimizations like memoized block rendering. citeturn0search1turn0search2turn0search3turn0search5

---

## 1) What Streamdown gives you

- Drop-in API parity with `react-markdown`, so existing props and plugins still work. citeturn0search1
- Streaming-friendly parsing that formats unterminated Markdown (bold, code, links, headings) as tokens arrive. citeturn0search5
- GitHub Flavored Markdown, math via KaTeX, and Mermaid diagrams out of the box. citeturn0search1turn0search8
- Security hardening for links/images plus Shiki-based code blocks. citeturn0search0turn0search8

---

## 2) Install + Tailwind wiring

<hb-code-example header="terminal">

```sh
npm install streamdown
```

</hb-code-example>

Add Streamdown’s styles to Tailwind so components render correctly:

<hb-code-example header="globals.css excerpt (Tailwind v4)">

```css
@source "../node_modules/streamdown/dist/index.js";
```

</hb-code-example>

For Tailwind v3, include `./node_modules/streamdown/dist/**/*.js` in `content` (see Streamdown docs). citeturn0search6

---

## 3) Minimal Hashbrown chat renderer

Use Streamdown to render streaming assistant text from `useChat` (or any text source).

<hb-code-example header="Chat.tsx">

```tsx
import React from 'react';
import { useChat } from '@hashbrownai/react';
import { Streamdown } from 'streamdown';

export function Chat() {
  const { messages, input, setInput, sendMessage, status } = useChat({
    model: 'gpt-5',
  });

  return (
    <div className="chat">
      <div className="messages">
        {messages.map((message) => (
          <div key={message.id} className={message.role}>
            {message.parts
              .filter((p) => p.type === 'text')
              .map((p, idx) => (
                <Streamdown key={idx}>{p.text}</Streamdown>
              ))}
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim()) return;
          sendMessage(input);
        }}
        className="composer"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={status === 'loading'}
          placeholder="Ask anything…"
        />
        <button type="submit" disabled={status === 'loading'}>
          Send
        </button>
      </form>
    </div>
  );
}
```

</hb-code-example>

Because Streamdown memoizes blocks and tolerates incomplete syntax, the UI stays stable as tokens stream. citeturn0search2turn0search5turn0search3

---

## 4) Prompting tips for Streamdown

- Let the model emit **full Markdown** (headings, lists, tables). Streamdown handles GFM safely. citeturn0search1
- Keep links to `http/https/mailto/tel`; Streamdown sanitizes content with rehype-harden defaults. citeturn0search0
- For citations, render your own footnote or side-panel UI: have the model output `[^id]` and map IDs to URLs before handing text to Streamdown.
- Keep chunks short to reduce reflow; Streamdown memoizes unchanged blocks automatically. citeturn0search8

---

## 5) Optional custom renderers

Streamdown exposes the `components` prop (same as `react-markdown`). Override nodes to align with your design system:

<hb-code-example header="custom-components.tsx">

```tsx
import { Streamdown, type Components } from 'streamdown';

const components: Components = {
  a: ({ node, ...props }) => (
    <a {...props} rel="noopener noreferrer" target="_blank" data-allow-navigation="true" />
  ),
  code: ({ inline, children, ...props }) =>
    inline ? (
      <code className="inline-code" {...props}>
        {children}
      </code>
    ) : (
      <code className="block-code" {...props}>
        {children}
      </code>
    ),
};

export function Markdown({ children }: { children: string }) {
  return <Streamdown components={components}>{children}</Streamdown>;
}
```

</hb-code-example>

---

## 6) Roadmap + migration

- Keep using Streamdown in React until Hashbrown ships Magic Text for React.
- When Magic Text arrives, swap the renderer and tighten prompts to inline-only Markdown if you want Angular/React parity.
- If you need HTML sanitization beyond Streamdown’s defaults, wrap its output in your own allow-list or keep using the `components` prop.

---

## 7) Troubleshooting

- Blank styles? Re-check Tailwind `@source` / `content` paths. citeturn0search6
- Missing syntax highlight? Ensure Shiki is available—Streamdown’s code blocks rely on it. citeturn0search8
- Performance regressions? Streamdown memoizes rendering; large jumps usually mean the streamed text is mutating entire blocks—shorten chunks or debounce updates. citeturn0search3

Streamdown keeps React chat UIs streaming-friendly today while we finish native Magic Text support.
