import { Component, computed, input } from '@angular/core';

type FaviconConfig = Record<string, string>;

const FAVICON_BY_HOST: FaviconConfig = {
  'allrecipes.com': '/favicons/www.allrecipes.com.ico',
  'arbys.com': '/favicons/www.arbys.com.png',
  'assets.ctfassets.net': '/favicons/assets.ctfassets.net.ico',
  'bk.com': '/favicons/www.bk.com.ico',
  'blog.pizzahut.com': '/favicons/blog.pizzahut.com.png',
  'calorieking.com': '/favicons/www.calorieking.com.ico',
  'chick-fil-a.com': '/favicons/www.chick-fil-a.com.png',
  'chipotle.com': '/favicons/www.chipotle.com.png',
  'coca-cola.com': '/favicons/www.coca-cola.com.ico',
  'dairyqueen.com': '/favicons/www.dairyqueen.com.ico',
  'dominos.com': '/favicons/www.dominos.com.ico',
  'drinkopenwater.com': '/favicons/drinkopenwater.com.png',
  'drinkpoppi.com': '/favicons/drinkpoppi.com.png',
  'drpepper.com': '/favicons/www.drpepper.com.ico',
  'fastfoodcalories.com': '/favicons/www.fastfoodcalories.com.png',
  'fastfoodnutrition.org': '/favicons/fastfoodnutrition.org.ico',
  'fastfoodpost.com': '/favicons/www.fastfoodpost.com.png',
  'fatsecret.com': '/favicons/www.fatsecret.com.png',
  'foods.fatsecret.com': '/favicons/foods.fatsecret.com.ico',
  'global.kfc.com': '/favicons/global.kfc.com.ico',
  'healthyfastfood.org': '/favicons/healthyfastfood.org.ico',
  'horizon.com': '/favicons/horizon.com.ico',
  'investors.jackinthebox.com': '/favicons/investors.jackinthebox.com.ico',
  'ir.chipotle.com': '/favicons/ir.chipotle.com.ico',
  'ir.dominos.com': '/favicons/ir.dominos.com.ico',
  'locations.jackinthebox.com': '/favicons/locations.jackinthebox.com.ico',
  'locations.kfc.com': '/favicons/locations.kfc.com.ico',
  'locations.pizzahut.com': '/favicons/locations.pizzahut.com.ico',
  'locations.wendys.com': '/favicons/locations.wendys.com.png',
  'lovethatchickenfrom.popeyes.com':
    '/favicons/lovethatchickenfrom.popeyes.com.png',
  'm.nutritionix.com': '/favicons/m.nutritionix.com.ico',
  'manuals.plus': '/favicons/manuals.plus.ico',
  'mcdonalds.com': '/favicons/www.mcdonalds.com.ico',
  'mcds-menu.com': '/favicons/www.mcds-menu.com.png',
  'myfooddiary.com': '/favicons/www.myfooddiary.com.ico',
  'news.bk.com': '/favicons/news.bk.com.png',
  'news.dairyqueen.com': '/favicons/news.dairyqueen.com.ico',
  'news.popeyes.com': '/favicons/news.popeyes.com.png',
  'newsroom.chipotle.com': '/favicons/newsroom.chipotle.com.ico',
  'newsroom.subway.com': '/favicons/newsroom.subway.com.png',
  'nutrition-charts.com': '/favicons/www.nutrition-charts.com.jpg',
  'nutritionix.com': '/favicons/www.nutritionix.com.ico',
  'order.wendys.com': '/favicons/order.wendys.com.ico',
  'popeyes.com': '/favicons/www.popeyes.com.ico',
  'scribd.com': '/favicons/www.scribd.com.ico',
  'sonicdrivein.com': '/favicons/www.sonicdrivein.com.png',
  'subway.com': '/favicons/www.subway.com.ico',
  'tacobell.com': '/favicons/www.tacobell.com.ico',
  'upload.wikimedia.org': '/favicons/upload.wikimedia.org.ico',
  'web.archive.org': '/favicons/web.archive.org.ico',
  'wendys.com': '/favicons/www.wendys.com.ico',
} as const;

type IconDisplay = {
  src?: string;
  fallback: string;
};

@Component({
  selector: 'app-citation-icon',
  template: `
    <span
      class="icon-wrapper"
      [class.icon-wrapper--image]="!!icon().src"
      aria-hidden="true"
    >
      @if (icon().src; as src) {
        <img
          class="icon-image"
          [src]="src"
          alt=""
          loading="lazy"
          decoding="async"
        />
      } @else {
        <span class="icon-fallback">
          {{ icon().fallback }}
        </span>
      }
    </span>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }

      .icon-wrapper {
        --size: 16px;
        width: var(--size);
        height: var(--size);
        border-radius: 4px;
        color: #4c515d;
        font-size: 0.65rem;
        font-weight: 600;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        text-transform: uppercase;
        background-color: white;
        border: 1px solid var(--gray-light);

        &:hover .icon-image {
          filter: grayscale(0);
          opacity: 1;
        }
      }

      .icon-image {
        width: 60%;
        height: 60%;
        object-fit: cover;
        display: block;
        filter: grayscale(1);
        opacity: 0.6;
        transition:
          filter 0.3s ease,
          opacity 0.3s ease;
      }

      .icon-fallback {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
      }
    `,
  ],
})
export class CitationIcon {
  readonly url = input.required<string>();

  protected readonly icon = computed<IconDisplay>(() => {
    try {
      const parsed = new URL(this.url());
      const host = parsed.hostname.toLowerCase();
      const normalized = normalizeHost(host);
      const src =
        FAVICON_BY_HOST[normalized] ?? FAVICON_BY_HOST[host] ?? undefined;

      return { src, fallback: fallbackLetter(normalized) };
    } catch {
      return { src: undefined, fallback: '?' };
    }
  });
}

const normalizeHost = (hostname: string) =>
  hostname.startsWith('www.') ? hostname.slice(4) : hostname;

const fallbackLetter = (hostname: string) => {
  const match = hostname.replace(/^www\./, '').match(/[a-z0-9]/i);
  return match ? match[0].toUpperCase() : '?';
};
