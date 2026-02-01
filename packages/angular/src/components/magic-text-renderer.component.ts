/* eslint-disable @angular-eslint/component-class-suffix */
/* eslint-disable no-useless-escape */
/* eslint-disable @angular-eslint/component-selector */
/* eslint-disable @angular-eslint/directive-selector */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  Directive,
  input,
  output,
  TemplateRef,
  ViewEncapsulation,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  type MagicTextFragment,
  type MagicTextFragmentCitation,
  type MagicTextFragmentText,
  type MagicTextHasWhitespace,
  type MagicTextTag,
  prepareMagicText,
} from '@hashbrownai/core';
import { Prettify } from '../utils/ts-helpers';

/** @public */
export type MagicTextCitation = { id: string; url: string };

/** @public */
export type MagicTextLinkClickEvent = {
  mouseEvent: MouseEvent;
  href: string;
  fragment: MagicTextFragmentText;
};

/** @public */
export type MagicTextCitationClickEvent = {
  mouseEvent: MouseEvent;
  citation: { id: string; url?: string };
  fragment: MagicTextFragmentCitation;
};

/** @public */
export type MagicTextWhitespacePosition = 'before' | 'after';

/** @public */
export type MagicTextWhitespaceContext = {
  position: MagicTextWhitespacePosition;
  render: boolean;
  fragment: MagicTextFragment;
};

/** @public */
export type MagicTextRenderTextContext = {
  text: string;
  tags: MagicTextTag[];
  state: MagicTextFragmentText['state'];
  isStatic: boolean;
  renderWhitespace: MagicTextHasWhitespace;
  isCode: boolean;
  fragment: MagicTextFragmentText;
};

/** @public */
export type MagicTextRenderLinkContext = Prettify<
  MagicTextRenderTextContext & {
    href: string;
    title?: string;
    ariaLabel?: string;
    rel?: string;
    target?: string;
    link: NonNullable<MagicTextFragmentText['marks']['link']>;
  }
>;

/** @public */
export interface MagicTextRenderCitationContext {
  citation: { id: string; number: number | string; url?: string };
  text: string;
  state: MagicTextFragmentCitation['state'];
  isStatic: boolean;
  renderWhitespace: MagicTextHasWhitespace;
  fragment: MagicTextFragmentCitation;
}

type $Implicit<T> = { $implicit: T };

@Directive({ selector: 'ng-template[hbMagicTextRenderLink]' })
export class MagicTextRenderLink {
  constructor(readonly template: TemplateRef<MagicTextRenderLinkContext>) {}

  static ngTemplateContextGuard(
    dir: MagicTextRenderLink,
    context: unknown,
  ): context is $Implicit<MagicTextRenderLinkContext> {
    return true;
  }
}

@Directive({ selector: 'ng-template[hbMagicTextRenderText]' })
export class MagicTextRenderText {
  constructor(readonly template: TemplateRef<MagicTextRenderTextContext>) {}

  static ngTemplateContextGuard(
    dir: MagicTextRenderText,
    context: unknown,
  ): context is $Implicit<MagicTextRenderTextContext> {
    return true;
  }
}

/** @public */
@Directive({ selector: 'ng-template[hbMagicTextRenderCitation]' })
export class MagicTextRenderCitation {
  constructor(readonly template: TemplateRef<MagicTextRenderCitationContext>) {}

  static ngTemplateContextGuard(
    dir: MagicTextRenderCitation,
    context: unknown,
  ): context is $Implicit<MagicTextRenderCitationContext> {
    return true;
  }
}

/** @public */
@Directive({ selector: 'ng-template[hbMagicTextRenderWhitespace]' })
export class MagicTextRenderWhitespace {
  constructor(readonly template: TemplateRef<MagicTextWhitespaceContext>) {}

  static ngTemplateContextGuard(
    dir: MagicTextRenderWhitespace,
    context: unknown,
  ): context is $Implicit<MagicTextWhitespaceContext> {
    return true;
  }
}

/** @public */
@Component({
  selector: 'hb-magic-text',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template
      #defaultWhitespace
      let-fragment="fragment"
      let-position="position"
      let-render="render"
    >
      @if (render) {
        <span
          class="hb-space"
          [class.hb-space--before]="position === 'before'"
          [class.hb-space--after]="position === 'after'"
          aria-hidden="true"
          >{{ ' ' }}</span
        >
      }
    </ng-template>

    <ng-template #defaultText let-node="node">
      <span
        class="hb-text"
        [class.hb-text--code]="node.isCode"
        [class.hb-text--strong]="node.tags.includes('strong')"
        [class.hb-text--em]="node.tags.includes('em')"
        [attr.data-fragment-state]="node.state"
        animate.enter="hb-text--enter"
        >{{ node.text }}</span
      >
    </ng-template>

    <ng-template #defaultLink let-node="node">
      <a
        class="hb-link"
        [attr.href]="node.href"
        [attr.title]="node.title || null"
        [attr.aria-label]="node.ariaLabel || null"
        [attr.rel]="node.rel || defaultLinkRel()"
        [attr.target]="node.target || defaultLinkTarget()"
        data-fragment-kind="text"
        [attr.data-fragment-state]="node.state"
        animate.enter="hb-text--enter"
        (click)="handleLinkClick($event, node.fragment)"
      >
        <ng-container
          *ngTemplateOutlet="
            textTemplate()?.template ?? defaultText;
            context: templateContext(toTextNode(node.fragment))
          "
        />
      </a>
    </ng-template>

    <ng-template #defaultCitation let-node="node">
      <span animate.enter="hb-text--enter">
        @if (node.citation.url) {
          <a
            class="hb-citation"
            role="doc-noteref"
            [attr.href]="node.citation.url"
            [attr.rel]="defaultLinkRel()"
            [attr.target]="defaultLinkTarget()"
            data-fragment-kind="citation"
            [attr.data-fragment-state]="node.state"
            (click)="handleCitationClick($event, node)"
            >{{ node.text }}</a
          >
        } @else {
          <button
            type="button"
            class="hb-citation hb-citation-placeholder"
            role="doc-noteref"
            data-fragment-kind="citation"
            [attr.data-fragment-state]="node.state"
            (click)="handleCitationClick($event, node)"
          >
            {{ node.text }}
          </button>
        }
      </span>
    </ng-template>

    @for (fragment of fragments(); track fragment.key; let i = $index) {
      <ng-container
        *ngTemplateOutlet="
          whitespaceTemplate()?.template ?? defaultWhitespace;
          context: whitespaceContext(fragment, 'before', i)
        "
      />

      <span
        class="hb-fragment"
        [attr.data-fragment-kind]="fragment.type"
        [attr.data-fragment-state]="fragment.state"
        animate.enter="hb-text--enter"
      >
        @if (fragment.type === 'text') {
          @if (fragment.marks.link) {
            <ng-container
              *ngTemplateOutlet="
                linkTemplate()?.template ?? defaultLink;
                context: templateContext(toLinkNode(fragment))
              "
            />
          } @else {
            <ng-container
              *ngTemplateOutlet="
                textTemplate()?.template ?? defaultText;
                context: templateContext(toTextNode(fragment))
              "
            />
          }
        } @else {
          <ng-container
            *ngTemplateOutlet="
              citationTemplate()?.template ?? defaultCitation;
              context: templateContext(toCitationNode(fragment))
            "
          />
        }
      </span>

      <ng-container
        *ngTemplateOutlet="
          whitespaceTemplate()?.template ?? defaultWhitespace;
          context: whitespaceContext(fragment, 'after', i)
        "
      />
    }
  `,
  encapsulation: ViewEncapsulation.None,
  styles: `
    .hb-text--code {
      font-family: monospace;
    }

    .hb-text--strong {
      font-weight: bold;
    }

    .hb-text--em {
      font-style: italic;
    }

    .hb-text--enter {
      animation: enter 350ms ease-in-out;
    }

    @keyframes enter {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
  `,
})
export class MagicText {
  readonly text = input.required<string>();
  readonly defaultLinkTarget = input('_blank');
  readonly defaultLinkRel = input('noopener noreferrer');
  readonly citations = input<MagicTextCitation[] | undefined>();

  readonly linkClick = output<MagicTextLinkClickEvent>();
  readonly citationClick = output<MagicTextCitationClickEvent>();

  readonly linkTemplate = contentChild(MagicTextRenderLink);
  readonly textTemplate = contentChild(MagicTextRenderText);
  readonly citationTemplate = contentChild(MagicTextRenderCitation);
  readonly whitespaceTemplate = contentChild(MagicTextRenderWhitespace);

  protected fragments = computed(() => {
    const fragments = prepareMagicText(this.text()).fragments;
    return fragments.map((fragment, index, all) => {
      if (fragment.type !== 'text') {
        return fragment;
      }

      const next = all[index + 1];
      const prev = all[index - 1];

      // Keep natural spacing, but strip edge spaces that would create gaps
      // around tight footnote citations.
      let text = fragment.text.replace(/[\u00a0\u202f]/g, ' ');
      if (next?.type === 'citation') {
        text = text.replace(/\s+$/, '');
      }
      if (prev?.type === 'citation') {
        text = text.replace(/^\s+/, '');
      }

      return { ...fragment, text };
    });
  });

  protected citationLookup = computed(() => {
    const map = new Map<string, string>();
    for (const citation of this.citations() ?? []) {
      if (!citation) {
        continue;
      }
      const key = citation.id?.trim?.() ?? '';
      const url = citation.url?.trim?.() ?? '';
      if (key && url) {
        map.set(key, url);
      }
    }
    return map;
  });

  protected whitespaceContext(
    fragment: MagicTextFragment,
    position: MagicTextWhitespacePosition,
    index: number,
  ) {
    const fragments = this.fragments();
    const previous = fragments[index - 1];

    let render =
      position === 'before'
        ? fragment.renderWhitespace.before
        : fragment.renderWhitespace.after;

    if (position === 'before' && index === 0) {
      render = false;
    }

    const next = fragments[index + 1];
    const hasLeadingWhitespace = (frag: MagicTextFragment | undefined) =>
      frag?.type === 'text' && /^\s/.test(frag.text);
    const hasTrailingWhitespace = (frag: MagicTextFragment | undefined) =>
      frag?.type === 'text' && /\s$/.test(frag.text);

    if (position === 'before') {
      // If the surrounding fragments already carry whitespace in their text,
      // avoid rendering an extra spacer node.
      const hasWhitespaceInText =
        hasTrailingWhitespace(previous) || hasLeadingWhitespace(fragment);
      render = render && !hasWhitespaceInText;
    }

    if (position === 'after') {
      const hasWhitespaceInText =
        hasTrailingWhitespace(fragment) || hasLeadingWhitespace(next);
      render = render && !hasWhitespaceInText;
    }

    if (position === 'before' && fragment.type === 'citation') {
      render = false;
    }

    // Footnote-style citations should sit tight against the preceding text.
    if (position === 'after' && next?.type === 'citation') {
      render = false;
    }

    const startsTight = (frag: MagicTextFragment | undefined): boolean =>
      frag?.type === 'text' && /^[,.;:!?|\)\]]/.test(frag.text.trim());

    const endsWithNoGap = (frag: MagicTextFragment | undefined): boolean =>
      frag?.type === 'text' && /([\(\|])$/.test(frag.text.trim());

    if (position === 'before' && startsTight(fragment)) {
      render = false;
    }

    if (position === 'after' && startsTight(next)) {
      render = false;
    }

    if (position === 'after' && endsWithNoGap(fragment)) {
      render = false;
    }

    return {
      $implicit: { position, render, fragment },
      position,
      render,
      fragment,
      index,
    } satisfies Record<string, unknown>;
  }

  protected templateContext<T>(node: T): $Implicit<T> & { node: T } {
    return { $implicit: node, node };
  }

  protected toTextNode(
    fragment: MagicTextFragmentText,
  ): MagicTextRenderTextContext {
    const text = this.normalizeFragmentText(fragment);
    return {
      text,
      tags: fragment.tags,
      state: fragment.state,
      isStatic: fragment.isStatic,
      renderWhitespace: fragment.renderWhitespace,
      isCode: fragment.isCode,
      fragment,
    };
  }

  protected normalizeFragmentText(fragment: MagicTextFragmentText): string {
    // Normalize only non-breaking spaces; keep the original whitespace intact
    // so we don't double-insert gaps alongside rendered spacer nodes.
    return fragment.text.replace(/[\u00a0\u202f]/g, ' ');
  }

  protected toLinkNode(
    fragment: MagicTextFragmentText,
  ): MagicTextRenderLinkContext {
    const link = fragment.marks.link;
    if (!link) {
      throw new Error('Link fragment is missing link metadata.');
    }
    return {
      ...this.toTextNode(fragment),
      href: link.href,
      title: link.title,
      ariaLabel: link.ariaLabel,
      rel: link.rel,
      target: link.target,
      link,
    };
  }

  protected toCitationNode(
    fragment: MagicTextFragmentCitation,
  ): MagicTextRenderCitationContext {
    const url = this.citationLookup().get(String(fragment.citation.id));
    const text = fragment.text.trim();
    return {
      citation: { ...fragment.citation, url },
      text,
      state: fragment.state,
      isStatic: fragment.isStatic,
      renderWhitespace: fragment.renderWhitespace,
      fragment,
    };
  }

  protected handleLinkClick(
    event: MouseEvent,
    fragment: MagicTextFragmentText,
  ) {
    const href = fragment.marks.link?.href ?? '';
    this.linkClick.emit({ mouseEvent: event, href, fragment });
  }

  protected handleCitationClick(
    event: MouseEvent,
    context: MagicTextRenderCitationContext,
  ) {
    this.citationClick.emit({
      mouseEvent: event,
      citation: { id: context.citation.id, url: context.citation.url },
      fragment: context.fragment,
    });
  }
}
