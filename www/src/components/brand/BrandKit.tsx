import {
  BRAND_CARDS,
  BRAND_COLORS,
  BRAND_FONTS,
  BRAND_LOGOS,
  type BrandAsset,
} from '../../lib/brand';
import styles from './BrandKit.module.css';

function Download({ asset }: { asset: BrandAsset }) {
  return (
    <a className={styles.download} href={asset.href} download>
      Download
      <span className={styles.visuallyHidden}> {asset.name}</span>
    </a>
  );
}

function AssetMeta({ asset }: { asset: BrandAsset }) {
  return (
    <div className={styles.meta}>
      <div className={styles.metaText}>
        <h3 className={styles.name}>{asset.name}</h3>
        <p className={styles.format}>{asset.format}</p>
        <p className={styles.use}>{asset.use}</p>
      </div>
      <Download asset={asset} />
    </div>
  );
}

/**
 * The brand kit: logos, share cards, colours and type, each logo and card
 * with a download link. Rendered by `/brand`.
 */
export function BrandKit() {
  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <h1 className={styles.title}>Brand</h1>
        <p className={styles.lede}>
          Logos, share cards, colours and type for writing about hashbrown. Use
          the wordmark as it is: don&apos;t recolour, stretch or outline it, and
          give it clear space at least as tall as its letters.
        </p>
      </header>

      <section className={styles.section} aria-labelledby="brand-logos">
        <h2 id="brand-logos" className={styles.heading}>
          Logos
        </h2>
        <ul className={styles.logos}>
          {BRAND_LOGOS.map((logo) => (
            <li key={logo.href} className={styles.tile}>
              <div
                className={`${styles.preview} ${logo.dark ? styles.dark : ''}`}
              >
                <img src={logo.href} alt="" className={styles.logo} />
              </div>
              <AssetMeta asset={logo} />
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="brand-cards">
        <h2 id="brand-cards" className={styles.heading}>
          Share cards
        </h2>
        <ul className={styles.cards}>
          {BRAND_CARDS.map((card) => (
            <li key={card.href} className={styles.tile}>
              <div className={`${styles.preview} ${styles.cardPreview}`}>
                <img
                  src={card.href}
                  width={card.width}
                  height={card.height}
                  alt=""
                  className={`${styles.card} ${card.width === card.height ? styles.square : ''}`}
                  loading="lazy"
                />
              </div>
              <AssetMeta asset={card} />
            </li>
          ))}
        </ul>
        <p className={styles.note}>
          Every blog post also has its own cards at{' '}
          <code>/blog/&lt;slug&gt;/opengraph-image</code> and{' '}
          <code>/blog/&lt;slug&gt;/square-card</code>.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="brand-colours">
        <h2 id="brand-colours" className={styles.heading}>
          Colours
        </h2>
        <ul className={styles.colors}>
          {BRAND_COLORS.map((color) => (
            <li key={color.token} className={styles.color}>
              <span
                className={styles.swatch}
                style={{ background: `var(--${color.token})` }}
              />
              <div className={styles.metaText}>
                <h3 className={styles.name}>{color.name}</h3>
                <p className={styles.format}>
                  <code>{color.hex}</code>
                </p>
                <p className={styles.use}>{color.use}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="brand-type">
        <h2 id="brand-type" className={styles.heading}>
          Type
        </h2>
        <ul className={styles.fonts}>
          {BRAND_FONTS.map((font) => (
            <li key={font.name} className={styles.tile}>
              <p
                className={`${styles.specimen} ${font.mono ? styles.mono : ''}`}
              >
                {font.mono ? 'npm install @hashbrownai/react' : 'Aa Bb Cc 123'}
              </p>
              <div className={styles.meta}>
                <div className={styles.metaText}>
                  <h3 className={styles.name}>{font.name}</h3>
                  <p className={styles.use}>{font.use}</p>
                </div>
                <a className={styles.download} href={font.href}>
                  Google Fonts
                </a>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
