import {
  clampDrawerHeight,
  DEV_TABS,
  type DevFilter,
  devTabBlocks,
  type DevTabId,
  readDrawerHeight,
  sendActivity,
  shownTurn,
  writeDrawerHeight,
} from '@atc/shared';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { DevMode } from './dev-mode';

/** How far an arrow key moves the drag handle, in pixels. */
const KEY_STEP = 24;

/** No filter run and nothing on the map. */
const NO_FILTER: DevFilter = { run: null, applied: null };

// Unique ids for the tabs and their panel (React uses useId).
let nextId = 0;

/**
 * The developer drawer under the map: tabs for the router, the cards
 * decision, the filter, the streaming UI JSON and the tool calls of the shown
 * send (the newest, or an answer picked in the chat until "Latest"). It only
 * reports; nothing in it changes the app. Everything is text (never HTML) and
 * the drawer is not a live region. Its top edge drags to resize it, clamped
 * to its column and remembered. `filter` is the Filter tab's input
 * (`devFilter`), from the app. The parent renders it only while dev mode is on.
 */
@Component({
  selector: 'atc-dev-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'atc-dev-drawer',
    role: 'region',
    'aria-label': 'Developer tools',
    'aria-live': 'off',
    'data-testid': 'dev-drawer',
    '[style.--atc-drawer-height]': 'heightStyle()',
    '(window:resize)': 'measure()',
  },
  template: `
    <div
      class="atc-dev-resize"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize developer tools"
      tabindex="0"
      [attr.aria-valuenow]="height()"
      [attr.aria-valuemin]="limits()?.min ?? null"
      [attr.aria-valuemax]="limits()?.max ?? null"
      (pointerdown)="dragStart($event)"
      (pointermove)="dragMove($event)"
      (pointerup)="dragEnd($event)"
      (pointercancel)="dragEnd($event)"
      (keydown)="resizeKey($event)"
    ></div>
    <div class="atc-dev-tabs">
      <div class="atc-dev-tablist" role="tablist">
        @for (entry of tabs; track entry.id; let index = $index) {
          <button
            type="button"
            role="tab"
            class="atc-dev-tab"
            [id]="ids + '-' + entry.id"
            [attr.aria-selected]="tab() === entry.id"
            [attr.aria-controls]="ids + '-panel'"
            [attr.tabindex]="tab() === entry.id ? 0 : -1"
            (click)="tab.set(entry.id)"
            (keydown)="moveTab($event, index)"
          >
            {{ entry.label }}
          </button>
        }
      </div>
      @if (!dev.selection().follow) {
        <button
          type="button"
          class="atc-dev-tab atc-dev-latest"
          (click)="dev.follow()"
        >
          Latest
        </button>
      }
    </div>
    <div
      class="atc-dev-body"
      role="tabpanel"
      tabindex="0"
      [id]="ids + '-panel'"
      [attr.aria-labelledby]="ids + '-' + tab()"
    >
      @for (block of blocks(); track $index) {
        <section class="atc-dev-block">
          <p class="atc-dev-title">{{ block.title }}</p>
          <pre>{{ block.text }}</pre>
        </section>
      }
    </div>
    <button
      type="button"
      class="atc-dev-close"
      aria-label="Close developer tools"
      (click)="dev.toggle()"
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path
          d="M4 4l8 8M12 4l-8 8"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
        />
      </svg>
    </button>
  `,
})
export class DevDrawer {
  /** The Filter tab's input, from `devFilter`. */
  readonly filter = input<DevFilter>(NO_FILTER);
  protected readonly dev = inject(DevMode);
  protected readonly tabs = DEV_TABS;
  protected readonly ids = `atc-dev-${nextId++}`;
  protected readonly tab = signal<DevTabId>('router');
  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  private readonly shown = computed(() =>
    shownTurn(this.dev.chat().turns, this.dev.selection()),
  );
  private readonly activity = computed(() => {
    const { items, turns, busy } = this.dev.chat();

    return sendActivity(items, turns, this.shown(), busy);
  });
  protected readonly blocks = computed(() => {
    const shown = this.shown();
    const activity = this.activity();

    return devTabBlocks(this.tab(), {
      typing: this.dev.typing(),
      turn: shown === null ? undefined : this.dev.chat().turns[shown],
      following: this.dev.selection().follow,
      routes: this.dev.routes(),
      answer: activity.answer,
      tools: activity.tools,
      filter: this.filter(),
    });
  });

  // The drawer's height: the remembered one (or the default share), clamped
  // to the column the drawer sits in. The column is measured after the first
  // render, whenever it resizes (a ResizeObserver, plus window resize), and on
  // every drag; a column with no height (phones, where the drawer is a sheet)
  // leaves the height to the stylesheet.
  private readonly wanted = signal(readDrawerHeight(this.dev.storage));
  private readonly column = signal(0);
  private drag: { y: number; from: number; to: number } | null = null;
  protected readonly height = computed(() =>
    this.column() > 0 ? clampDrawerHeight(this.wanted(), this.column()) : null,
  );
  protected readonly heightStyle = computed(() => {
    const height = this.height();

    return height === null ? null : `${height}px`;
  });
  protected readonly limits = computed(() =>
    this.column() > 0
      ? {
          min: clampDrawerHeight(0, this.column()),
          max: clampDrawerHeight(Number.MAX_SAFE_INTEGER, this.column()),
        }
      : null,
  );

  constructor() {
    let observer: ResizeObserver | null = null;
    afterNextRender(() => {
      this.measure();
      const parent = this.host.parentElement;
      if (parent && typeof ResizeObserver === 'function') {
        observer = new ResizeObserver(() => this.measure());
        observer.observe(parent);
      }
    });
    inject(DestroyRef).onDestroy(() => {
      observer?.disconnect();
      // A drag in progress when the drawer closes must not leave selection off.
      if (this.drag !== null) endSelectionBlock();
    });
  }

  /** Measures the column the drawer sits in, and returns its height. */
  protected measure(): number {
    const px = this.host.parentElement?.getBoundingClientRect().height ?? 0;
    this.column.set(px);

    return px;
  }

  protected moveTab(event: KeyboardEvent, index: number): void {
    const last = DEV_TABS.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % DEV_TABS.length
        : event.key === 'ArrowLeft'
          ? (index + last) % DEV_TABS.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    this.tab.set(DEV_TABS[next].id);
    this.host
      .querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [next]?.focus();
  }

  // A drag uses the primary button only and stops text selection while it
  // runs; the height is remembered when a drag ends or is cancelled.
  protected dragStart(event: PointerEvent): void {
    if (event.button !== 0) return;
    const columnPx = this.measure();
    if (columnPx <= 0) return;
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture?.(event.pointerId);
    document.body.style.userSelect = 'none';
    const from = clampDrawerHeight(this.wanted(), columnPx);
    this.drag = { y: event.clientY, from, to: from };
  }

  protected dragMove(event: PointerEvent): void {
    const start = this.drag;
    if (start === null) return;
    const to = clampDrawerHeight(
      start.from + (start.y - event.clientY),
      this.measure(),
    );
    this.drag = { ...start, to };
    this.wanted.set(to);
  }

  protected dragEnd(event: PointerEvent): void {
    const end = this.drag;
    if (end === null) return;
    this.drag = null;
    endSelectionBlock();
    const handle = event.currentTarget as HTMLElement;
    if (handle.hasPointerCapture?.(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
    writeDrawerHeight(this.dev.storage, end.to);
  }

  // Keys move the handle and are remembered: arrows step, Home and End go to
  // the limits.
  protected resizeKey(event: KeyboardEvent): void {
    const height = this.height();
    if (height === null) return;
    const px =
      event.key === 'ArrowUp'
        ? height + KEY_STEP
        : event.key === 'ArrowDown'
          ? height - KEY_STEP
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? Number.MAX_SAFE_INTEGER
              : null;
    if (px === null) return;
    event.preventDefault();
    const next = clampDrawerHeight(px, this.measure());
    this.wanted.set(next);
    writeDrawerHeight(this.dev.storage, next);
  }
}

/** Lets the page select text again after a drag. */
function endSelectionBlock(): void {
  document.body.style.userSelect = '';
}
