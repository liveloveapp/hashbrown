---
title: 'Local Browser Models (Chrome & Edge)'
meta:
  - name: description
    content: "Run Hashbrown on Chrome's Gemini Nano or Edge's Phi-4-mini using the experimental_local transport, with automatic cloud fallback."
---

# Local Models (Chrome + Edge)

<p class="subtitle">Keep prompts on-device when available, fall back to the network when not, and keep structured outputs intact.</p>

What you'll learn:

1. Enable the built-in models in Chrome or Edge (flags, hardware, languages)
2. Wire `experimental_local` with cloud fallbacks in React
3. Surface download/availability state in your UI
4. Keep structured outputs working without tool calls

---

## 0. Why local models?

- **Privacy + offline**: prompts never leave the device once the model is downloaded.
- **Zero per-request cost**: no API key usage while the browser model is used.
- **Low latency**: tokens stream locally; Hashbrown framing stays the same.

---

## 1. Prerequisites and flags (as of Dec 14, 2025)

| Browser              | Languages                | System Requirements                           | Flags to enable                                                                                |
| -------------------- | ------------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Chrome - Gemini Nano | en, es, ja               | >=22 GB disk; >4 GB VRAM or 16 GB RAM/4 cores | `optimization-guide-on-device-model`, `prompt-api-for-gemini-nano` (or `...-multimodal-input`) |
| Edge - Phi-4-mini    | en (others experimental) | >=5.5 GB VRAM or strong CPU                   | `prompt-api-for-phi-mini`                                                                      |

After toggling flags, restart the browser and run `await LanguageModel.availability();` in DevTools to confirm readiness. Localhost does not require an origin trial.

---

## 2. Hashbrown building blocks (React)

- `useStructuredCompletion` from `@hashbrownai/react` to stream typed outputs.
- `experimental_local()` from `@hashbrownai/core/transport` tries Chrome first, then Edge.
- Pass a model array for fallback; Hashbrown advances on `FEATURE_UNSUPPORTED` or `PLATFORM_UNSUPPORTED`, but retries stay on the chosen adapter for generation errors.
- Event hooks (`availability`, `downloadRequired`, `downloadProgress`) let you mirror browser download state in React state.

---

## 3. Quickstart: local-first structured completion (React)

This component streams a two-day itinerary schema. It prefers the on-device model and falls back to `gpt-5-mini` if local is unavailable or unsupported.

<hb-code-example header="LocalItinerary.tsx">

```tsx
import { useMemo, useState } from 'react';
import { s } from '@hashbrownai/core';
import { experimental_local } from '@hashbrownai/core/transport';
import { useStructuredCompletion } from '@hashbrownai/react';

const ItinerarySchema = s.object('2-day plan', {
  city: s.string('Destination city'),
  days: s.streaming.array(
    'List of days',
    s.object('Day', {
      title: s.streaming.string('Title'),
      highlights: s.streaming.array(
        'Top things to do',
        s.streaming.string('Activity'),
      ),
    }),
  ),
});

export function LocalItinerary() {
  const [city, setCity] = useState('Lisbon');
  const [availability, setAvailability] = useState<string | null>(null);
  const [downloadRequired, setDownloadRequired] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);

  const input = useMemo(
    () => (city ? `Plan a concise two-day itinerary for ${city}.` : null),
    [city],
  );

  const { output, error, isSending, reload } = useStructuredCompletion({
    debugName: 'local-itinerary-react',
    input,
    system: 'Return a two-day itinerary as JSON that matches the schema.',
    schema: ItinerarySchema,
    model: [
      experimental_local({
        events: {
          availability: setAvailability,
          downloadRequired: () => setDownloadRequired(true),
          downloadProgress: setDownloadProgress,
        },
      }),
      'gpt-5-mini', // cloud fallback
    ],
  });

  return (
    <section style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
      <div>
        <label style={{ display: 'block', fontWeight: 600 }}>Destination</label>
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Lisbon"
        />
      </div>

      <div style={{ fontSize: 14, color: '#555' }}>
        <div>Availability: {availability ?? 'checking...'}</div>
        {downloadRequired && (
          <div>Download required (triggered on first prompt)</div>
        )}
        {downloadProgress !== null && <div>Download: {downloadProgress}%</div>}
      </div>

      <button onClick={reload} disabled={isSending}>
        {isSending ? 'Generating...' : 'Generate locally'}
      </button>

      {output && (
        <pre style={{ background: '#0f172a', color: '#f8fafc', padding: 12 }}>
          {JSON.stringify(output, null, 2)}
        </pre>
      )}

      {error && <div style={{ color: 'crimson' }}>Error: {error.message}</div>}
    </section>
  );
}
```

</hb-code-example>

**How it works**

- `experimental_local` creates a stable transport that reuses a browser session; events keep your UI in sync with download state.
- If tools are requested, local returns `FEATURE_UNSUPPORTED` and Hashbrown falls back to `gpt-5-mini`.
- `reload` lets users retry after enabling flags or freeing disk space without remounting the component.

---

## 4. Troubleshooting (React focus)

- `PLATFORM_UNSUPPORTED`: API missing, wrong browser channel, or flags off. Re-check the table above.
- `FEATURE_UNSUPPORTED`: tools requested or schema unsupported; ensure a cloud fallback is present.
- Slow first token: the model may still be downloading; keep surfacing `downloadProgress`.
- Model evicted because of low disk: rerun with `reload` after the browser re-downloads the model.
