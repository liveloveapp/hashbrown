import {
  type CodeSample,
  HERO_CODE,
  type Sdk,
  type Step,
  STEPS,
} from '../components/home/home.content';
import { highlightCode } from './rehype-shiki';

/** Highlighted HTML for the homepage code samples, per framework. */
export interface HomeCodeHtml {
  /** The hero sample for each framework. */
  hero: Record<Sdk, string>;
  /** The three "How it works" steps for each framework, in order. */
  steps: Record<Sdk, string[]>;
}

const highlightSample = (
  sample: Pick<CodeSample, 'code'> & { lang?: string },
) => highlightCode(sample.code, sample.lang ?? 'typescript');

const highlightSteps = (steps: readonly Step[]) =>
  Promise.all(steps.map(highlightSample));

/**
 * Highlight the hero and step code for both frameworks with the site's Shiki
 * theme. Call it from a Server Component so the work happens at build time;
 * this replaces the Analog site's `virtual:home-code-html` module.
 */
export async function getHomeCodeHtml(): Promise<HomeCodeHtml> {
  const [heroReact, heroAngular, stepsReact, stepsAngular] = await Promise.all([
    highlightSample(HERO_CODE.react),
    highlightSample(HERO_CODE.angular),
    highlightSteps(STEPS.react),
    highlightSteps(STEPS.angular),
  ]);
  return {
    hero: { react: heroReact, angular: heroAngular },
    steps: { react: stepsReact, angular: stepsAngular },
  };
}
