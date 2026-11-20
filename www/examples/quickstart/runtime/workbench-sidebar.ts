import { workbenchIcon, workbenchLessonIcons } from './workbench-icons';
import type { WorkbenchLayout } from './workbench-layout';
import {
  workbenchLessonGroups,
  type WorkbenchLessonId,
  workbenchLessons,
  type WorkbenchSidebarSection,
} from './workbench-lessons';

/** Everything the workbench sidebar needs to render one frame. */
export interface WorkbenchSidebarOptions {
  /** The framework name, used to build lesson links such as `react.html`. */
  readonly framework: string;
  /** Shows a single fixed topic for an isolated consumer without lesson navigation. */
  readonly fixedTopic?: string;
  /** Omits the new-conversation control when no runtime reset is available. */
  readonly hideCreate?: boolean;
  /** The lesson marked with `aria-current="page"`. */
  readonly currentLesson: WorkbenchLessonId;
  /** The retained conversations, listed in the Conversations section. */
  readonly conversations: readonly {
    readonly id: string;
    readonly label: string;
  }[];
  /** The id of the conversation marked `aria-pressed="true"`. */
  readonly currentConversation: string;
  /** The persisted rail and collapsed-section preferences. */
  readonly layout: WorkbenchLayout;
  /** A prefix that keeps heading/list ids unique per mounted shell. */
  readonly idPrefix?: string;
  /** Selects a retained conversation. */
  readonly onSelect: (id: string) => void;
  /** Starts a new conversation. */
  readonly onCreate: () => void;
  /** In rail mode, whether the full sidebar floats over the chat. View state only. */
  readonly overlayOpen: boolean;
  /** Opens the lesson overlay from the rail button. */
  readonly onOpenOverlay: () => void;
  /** Closes the lesson overlay, including after a choice is made in it. */
  readonly onCloseOverlay: () => void;
  /** "Keep open": pins the sidebar (saves `rail: false`) from the overlay. */
  readonly onPin: () => void;
  /** Collapses the open sidebar back to the icon rail. */
  readonly onToggleRail: () => void;
  /** Folds or unfolds one sidebar section. */
  readonly onToggleSection: (section: WorkbenchSidebarSection) => void;
}

function labelled(
  node: HTMLElement,
  icon: SVGSVGElement,
  label: string,
): HTMLElement {
  const text = document.createElement('span');
  text.className = 'wb-label';
  text.textContent = label;
  node.setAttribute('aria-label', label);
  node.append(icon, text);
  return node;
}

function actionButton(
  className: string,
  key: string,
  onClick: () => void,
): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  if (className) node.className = className;
  node.dataset.navKey = key;
  node.onclick = onClick;
  return node;
}

/** Returns the stable key of the focused sidebar control, if focus is inside nav. */
function focusedKey(nav: HTMLElement): string | undefined {
  const active = nav.ownerDocument.activeElement;
  if (!active || !nav.contains(active)) return undefined;
  return active.closest<HTMLElement>('[data-nav-key]')?.dataset.navKey;
}

/**
 * Finds the nearest sidebar scroll adjustment that reveals the selected lesson without hiding keyboard focus.
 *
 * @param viewport - The sidebar's visible vertical bounds.
 * @param current - The selected lesson's bounds, or zero-height bounds for a collapsed group.
 * @param focused - Bounds of the currently focused sidebar control, when present.
 * @returns The scroll delta; zero when already visible, hidden, or incompatible with visible focus.
 */
export function workbenchSidebarScrollDelta(
  viewport: Readonly<{ top: number; bottom: number }>,
  current: Readonly<{ top: number; bottom: number }>,
  focused?: Readonly<{ top: number; bottom: number }>,
): number {
  if (viewport.bottom <= viewport.top || current.bottom <= current.top)
    return 0;
  const delta =
    current.bottom > viewport.bottom
      ? current.bottom - viewport.bottom
      : current.top < viewport.top
        ? current.top - viewport.top
        : 0;
  if (
    focused &&
    (focused.top - delta < viewport.top ||
      focused.bottom - delta > viewport.bottom)
  )
    return 0;
  return delta;
}

/**
 * Replaces `nav`'s children with the sectioned, collapsible workbench sidebar:
 * a New conversation call to action, the rail toggle, then the Conversations,
 * Concepts, Production and Recipes sections.
 *
 * @param nav - The `nav.wb-nav` element to render into.
 * @param options - The sidebar state and callbacks.
 */
export function renderWorkbenchSidebar(
  nav: HTMLElement,
  options: WorkbenchSidebarOptions,
): void {
  const restore = focusedKey(nav);
  if (options.layout.rail && options.overlayOpen) {
    // The rail keeps only its button; the full sidebar floats over it.
    const rail = railButton(options, 'Close lessons', options.onCloseOverlay);
    rail.setAttribute('aria-expanded', 'true');
    const top = document.createElement('div');
    top.className = 'wb-nav-top';
    top.append(rail);
    const overlay = document.createElement('div');
    overlay.className = 'wb-nav-overlay';
    overlay.append(
      ...buildSidebar({
        ...options,
        layout: { ...options.layout, rail: false },
        pin: true,
        onSelect: (id) => {
          options.onCloseOverlay();
          options.onSelect(id);
        },
        onCreate: () => {
          options.onCloseOverlay();
          options.onCreate();
        },
        onChooseLesson: options.onCloseOverlay,
      }),
    );
    nav.replaceChildren(top, overlay);
  } else {
    nav.replaceChildren(...buildSidebar(options));
  }
  if (restore)
    [...nav.querySelectorAll<HTMLElement>('[data-nav-key]')]
      .find((node) => node.dataset.navKey === restore)
      ?.focus();
}

function railButton(
  options: WorkbenchSidebarOptions,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const rail = actionButton('wb-rail-toggle', 'rail', onClick);
  rail.setAttribute('aria-label', label);
  rail.title = label;
  rail.append(workbenchIcon('sidebar'));
  return rail;
}

type SidebarBuild = WorkbenchSidebarOptions & {
  readonly pin?: boolean;
  readonly onChooseLesson?: () => void;
};

function buildSidebar(options: SidebarBuild): HTMLElement[] {
  const { layout } = options;
  const prefix = options.idPrefix ?? 'wb';
  const top = document.createElement('div');
  top.className = 'wb-nav-top';
  const cta = labelled(
    actionButton('wb-cta', 'cta', options.onCreate),
    workbenchIcon('plus'),
    'New conversation',
  );
  const rail = options.pin
    ? railButton(options, 'Keep open', options.onPin)
    : railButton(
        options,
        layout.rail ? 'Expand sidebar' : 'Collapse sidebar',
        layout.rail ? options.onOpenOverlay : options.onToggleRail,
      );
  if (options.pin) rail.dataset.navKey = 'pin';
  else rail.setAttribute('aria-expanded', String(!layout.rail));
  top.append(...(options.hideCreate ? [] : [cta]), rail);

  function group(
    section: WorkbenchSidebarSection,
    title: string,
    list: HTMLElement,
  ): HTMLElement {
    const collapsed = layout.collapsed.includes(section);
    const node = document.createElement('section');
    node.className = 'wb-nav-group';
    node.dataset.section = section;
    list.id = `${prefix}-nav-${section}`;
    const heading = actionButton('wb-nav-heading', `section:${section}`, () =>
      options.onToggleSection(section),
    );
    heading.id = `${prefix}-nav-${section}-heading`;
    node.setAttribute('aria-labelledby', heading.id);
    const headingTitle = document.createElement('h2');
    headingTitle.append(heading);
    heading.setAttribute('aria-expanded', String(!collapsed));
    heading.setAttribute('aria-controls', list.id);
    const text = document.createElement('span');
    text.className = 'wb-label';
    text.textContent = title;
    heading.append(text, workbenchIcon('chevron-down'));
    if (collapsed) {
      list.dataset.collapsed = '';
      if (!layout.rail) list.setAttribute('inert', '');
    }
    node.append(headingTitle, list);
    return node;
  }

  const conversations = document.createElement('div');
  conversations.className = 'wb-conversations';
  for (const item of options.conversations) {
    const select = labelled(
      actionButton('', `conversation:${item.id}`, () =>
        options.onSelect(item.id),
      ),
      workbenchIcon('conversation'),
      item.label,
    );
    select.setAttribute(
      'aria-pressed',
      String(item.id === options.currentConversation),
    );
    conversations.append(select);
  }

  const lessonGroups = options.fixedTopic
    ? []
    : workbenchLessonGroups.map(({ id, title, lessons }) => {
        const links = document.createElement('div');
        links.className = 'wb-lessons';
        for (const lesson of lessons) {
          const meta = workbenchLessons.find((entry) => entry.id === lesson);
          const link = document.createElement('a');
          link.dataset.navKey = `lesson:${lesson}`;
          link.href = `${options.framework.toLowerCase()}.html?lesson=${lesson}`;
          labelled(
            link,
            workbenchIcon(workbenchLessonIcons[lesson]),
            meta?.title ?? lesson,
          );
          if (options.onChooseLesson)
            link.addEventListener('click', options.onChooseLesson);
          if (lesson === options.currentLesson)
            link.setAttribute('aria-current', 'page');
          links.append(link);
        }
        return group(id, title, links);
      });

  if (options.fixedTopic) {
    const topic = document.createElement('div');
    topic.className = 'wb-lessons';
    const current = labelled(
      document.createElement('span'),
      workbenchIcon('conversation'),
      options.fixedTopic,
    );
    current.setAttribute('aria-current', 'page');
    topic.append(current);
    lessonGroups.push(group('start', 'Get started', topic));
  }

  return [
    top,
    group('conversations', 'Conversations', conversations),
    ...lessonGroups,
  ];
}
