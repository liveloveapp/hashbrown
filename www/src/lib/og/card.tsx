import { ImageResponse } from 'next/og';
import { loadCardFonts, svgDataUri } from './assets';
import { CARD_COLORS, GITHUB_SIZE, OG_SIZE, titleSize } from './tokens';

/** What a card says. */
export interface CardContent {
  /** The headline, bottom left. */
  title: string;
  /** Lines under the title, in muted text. */
  subtitle: string[];
  /** Optional code shown in a mono pill under the subtitle. */
  code?: string;
  /** `og` (1200x630, default) or `github` (1280x640). */
  size?: 'og' | 'github';
}

/**
 * The one card layout, in LiveLoveApp's house style: hashbrown's logo top
 * left, "by" and the LiveLoveApp mark top right, the title and subtitle bottom
 * left, on white.
 */
export function Card({ title, subtitle, code, size = 'og' }: CardContent) {
  const { width, height } = size === 'github' ? GITHUB_SIZE : OG_SIZE;
  const padding = size === 'github' ? '80px 96px' : '72px';
  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding,
        background: CARD_COLORS.ground,
        color: CARD_COLORS.ink,
        fontFamily: 'Hanken Grotesk',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src={svgDataUri('hashbrown-mark')} width={68} height={64} alt="" />
          <img src={svgDataUri('hashbrown-wordmark')} width={268} height={40} alt="" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 22, color: CARD_COLORS.muted }}>
          by
          <img src={svgDataUri('lla-mark')} width={80} height={30} alt="" />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            ...titleSize(title),
            fontWeight: 600,
            letterSpacing: '-0.03em',
            maxWidth: 1000,
          }}
        >
          {title}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
          {subtitle.map((line) => (
            <div key={line} style={{ display: 'flex', fontSize: 26, color: CARD_COLORS.muted, maxWidth: 1000 }}>
              {line}
            </div>
          ))}
        </div>
        {code ? (
          <div style={{ display: 'flex', marginTop: 32 }}>
            <div
              style={{
                display: 'flex',
                fontFamily: 'JetBrains Mono',
                fontSize: 24,
                padding: '10px 24px',
                background: CARD_COLORS.surface,
                border: `1px solid ${CARD_COLORS.rule}`,
                borderRadius: 999,
              }}
            >
              {code}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Render a card to a PNG response with the card fonts loaded.
 *
 * @param content - What the card says and which size to render.
 */
export async function renderCard(content: CardContent): Promise<ImageResponse> {
  const { width, height } = content.size === 'github' ? GITHUB_SIZE : OG_SIZE;
  return new ImageResponse(<Card {...content} />, {
    width,
    height,
    fonts: await loadCardFonts(),
  });
}
