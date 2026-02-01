export interface TextFragment {
  id: number;
  text: string;
}

export interface SegmentedText {
  id: number;
  fragments: TextFragment[];
}

export function createTextFragments(text: string): TextFragment[] {
  const segmenter = new Intl.Segmenter('en', { granularity: 'word' });
  const segments = Array.from(segmenter.segment(text));

  return segments.map((segment) => ({
    id: segment.index,
    text: segment.segment,
  }));
}

export function createSegmentedTexts(
  texts: readonly string[],
): SegmentedText[] {
  return texts.map((text, index) => ({
    id: index,
    fragments: createTextFragments(text),
  }));
}
