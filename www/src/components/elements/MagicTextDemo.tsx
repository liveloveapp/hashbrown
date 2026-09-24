'use client';

import { MagicTextRenderer } from '@hashbrownai/react';
import { useId, useState } from 'react';
import styles from './MagicTextDemo.module.css';

const FULL_MARKDOWN = `
**Hashbrowns** at [Waffle House](https://www.wafflehouse.com) started as simple scattered potatoes when the first shop opened in 1955[^wiki]; the now-iconic "scattered, smothered & covered" shorthand hit menus in February 1984[^wh]. Grill crews kept riffing until the \`all-the-way\` call piled on every topping — cheese, ham, tomatoes, jalapeños, mushrooms, chili, *and* sausage gravy — a salty love letter to late-night diners[^gng]. Today cooks still sear the potatoes on the open griddle so cheese melts while onions stay *just* caramelized[^eater].

[^wiki]: Wikipedia https://en.wikipedia.org/wiki/Waffle_House
[^wh]: Waffle House https://www.wafflehouse.com/pstories/waffle-house-hashbrowns/
[^gng]: Garden and Gun https://gardenandgun.com/articles/scattered-smothered-covered-chunked-too-today-in-southern-history
[^eater]: Eater https://www.eater.com/2017/5/2/15471798/waffle-house-history-menu`;

/**
 * The first `percent`% of `markdown`, as if a model had streamed that much.
 *
 * @param markdown - The complete text.
 * @param percent - 0–100; values outside are clamped.
 */
export function visibleMarkdown(markdown: string, percent: number): string {
  const clamped = Math.max(0, Math.min(100, percent));
  return markdown.slice(
    0,
    Math.max(0, Math.round((clamped / 100) * markdown.length)),
  );
}

/**
 * `<hb-magic-text-demo>`: a slider that replays a fixed markdown answer
 * through `MagicTextRenderer`, simulating a stream. It makes no model call.
 */
export function MagicTextDemo() {
  const [percent, setPercent] = useState(100);
  const sliderId = useId();

  return (
    <section className={styles.demo}>
      <div className={styles.preview} aria-label="Magic Text preview">
        <MagicTextRenderer
          className={styles.magic}
          isComplete={percent === 100}
          caret
          segmenter={{ granularity: 'word' }}
        >
          {visibleMarkdown(FULL_MARKDOWN, percent)}
        </MagicTextRenderer>
      </div>

      <div className={styles.controls}>
        <label htmlFor={sliderId}>
          Stream progress: <span>{percent}%</span>
        </label>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={100}
          step={1}
          aria-label="Stream percentage"
          value={percent}
          onChange={(event) => {
            const value = event.currentTarget.valueAsNumber;
            if (!Number.isNaN(value)) {
              setPercent(Math.max(0, Math.min(100, value)));
            }
          }}
        />
      </div>
    </section>
  );
}
