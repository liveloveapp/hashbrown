import type { WorkbenchLessonId } from './workbench-lessons';

/** The icon names available to the workbench shell. */
export type WorkbenchIconName =
  | 'plus'
  | 'sidebar'
  | 'chevron-down'
  | 'conversation'
  | 'previous-turn'
  | 'previous-event'
  | 'play'
  | 'pause'
  | 'next-event'
  | 'next-turn'
  | 'raw-events'
  | 'layout'
  | 'wrench'
  | 'braces'
  | 'activity'
  | 'file-code'
  | 'branch'
  | 'bug'
  | 'transform'
  | 'wand'
  | 'lightbulb'
  | 'square-check'
  | 'flag'
  | 'messages'
  | 'scroll';

interface IconElement {
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
}

const el = (
  tag: string,
  attrs: Readonly<Record<string, string>>,
): IconElement => ({ tag, attrs });
const path = (d: string) => el('path', { d });
const line = (x1: string, y1: string, x2: string, y2: string) =>
  el('line', { x1, y1, x2, y2 });
const polyline = (points: string) => el('polyline', { points });
const polygon = (points: string) => el('polygon', { points });
const circle = (cx: string, cy: string, r: string) =>
  el('circle', { cx, cy, r });
const rect = (
  x: string,
  y: string,
  width: string,
  height: string,
  rx: string,
) => el('rect', { x, y, width, height, rx });

const icons: Readonly<Record<WorkbenchIconName, readonly IconElement[]>> = {
  plus: [line('12', '5', '12', '19'), line('5', '12', '19', '12')],
  sidebar: [rect('3', '3', '18', '18', '2'), line('9', '3', '9', '21')],
  'chevron-down': [polyline('6 9 12 15 18 9')],
  conversation: [
    path('M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'),
  ],
  'previous-turn': [
    polygon('19 20 9 12 19 4 19 20'),
    line('5', '19', '5', '5'),
  ],
  'previous-event': [polyline('15 18 9 12 15 6')],
  play: [polygon('7 4 20 12 7 20 7 4')],
  pause: [rect('6', '4', '4', '16', '1'), rect('14', '4', '4', '16', '1')],
  'next-event': [polyline('9 18 15 12 9 6')],
  'next-turn': [polygon('5 4 15 12 5 20 5 4'), line('19', '5', '19', '19')],
  'raw-events': [
    line('8', '6', '21', '6'),
    line('8', '12', '21', '12'),
    line('8', '18', '21', '18'),
    line('3', '6', '3.01', '6'),
    line('3', '12', '3.01', '12'),
    line('3', '18', '3.01', '18'),
  ],
  layout: [
    rect('3', '3', '7', '9', '1'),
    rect('14', '3', '7', '5', '1'),
    rect('14', '12', '7', '9', '1'),
    rect('3', '16', '7', '5', '1'),
  ],
  wrench: [
    path(
      'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
    ),
  ],
  braces: [
    path(
      'M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1',
    ),
    path(
      'M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1',
    ),
  ],
  activity: [polyline('22 12 18 12 15 21 9 3 6 12 2 12')],
  'file-code': [
    path('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'),
    polyline('14 2 14 8 20 8'),
    path('M10 13l-2 2 2 2'),
    path('M14 17l2-2-2-2'),
  ],
  branch: [
    circle('6', '6', '3'),
    circle('18', '6', '3'),
    circle('12', '18', '3'),
    path('M6 9v1a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9'),
    line('12', '12', '12', '15'),
  ],
  bug: [
    rect('8', '6', '8', '14', '4'),
    path(
      'M19 7l-3 2M5 7l3 2M19 19l-3-2M5 19l3-2M20 13h-4M4 13h4M10 4l1 2M14 4l-1 2',
    ),
  ],
  transform: [
    polyline('17 1 21 5 17 9'),
    path('M3 11V9a4 4 0 0 1 4-4h14'),
    polyline('7 23 3 19 7 15'),
    path('M21 13v2a4 4 0 0 1-4 4H3'),
  ],
  wand: [
    path(
      'M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M15 9h0M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5',
    ),
  ],
  lightbulb: [
    path('M9 18h6M10 22h4'),
    path(
      'M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14',
    ),
  ],
  'square-check': [
    rect('3', '3', '18', '18', '2'),
    polyline('8 12 11 15 16 9'),
  ],
  flag: [
    path('M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z'),
    line('4', '22', '4', '15'),
  ],
  messages: [
    path('M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z'),
    path('M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1'),
  ],
  scroll: [
    path('M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4'),
    path('M19 17V5a2 2 0 0 0-2-2H4'),
  ],
};

/** The icon shown beside each lesson in the sidebar. */
export const workbenchLessonIcons: Readonly<
  Record<WorkbenchLessonId, WorkbenchIconName>
> = {
  'generative-ui': 'layout',
  tools: 'wrench',
  'structured-output': 'braces',
  streaming: 'activity',
  schemas: 'file-code',
  decisions: 'branch',
  debugging: 'bug',
  'request-transformation': 'transform',
  'magic-text': 'wand',
  predictions: 'lightbulb',
  'ui-selection': 'square-check',
  'first-plan': 'flag',
  conversation: 'messages',
  'system-instructions': 'scroll',
  'shared-state': 'braces',
  activities: 'activity',
  interrupts: 'square-check',
  'agent-decisions': 'branch',
  'json-parser': 'braces',
  'natural-forms': 'file-code',
  'server-threads': 'messages',
  'public-endpoint': 'square-check',
  'message-history': 'messages',
  'save-text-conversations': 'scroll',
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Builds a decorative inline stroke icon; color follows `currentColor`. */
export function workbenchIcon(name: WorkbenchIconName): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const attrs: Record<string, string> = {
    class: 'wb-icon',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  };
  for (const [key, value] of Object.entries(attrs)) {
    svg.setAttribute(key, value);
  }
  for (const { tag, attrs: elAttrs } of icons[name]) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(elAttrs)) {
      node.setAttribute(key, value);
    }
    svg.appendChild(node);
  }
  return svg;
}
