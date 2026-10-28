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
  /** Toggles the icon rail. */
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
  const { layout } = options;
  const restore = focusedKey(nav);
  const prefix = options.idPrefix ?? 'wb';
  const top = document.createElement('div');
  top.className = 'wb-nav-top';
  const cta = labelled(
    actionButton('wb-cta', 'cta', options.onCreate),
    workbenchIcon('plus'),
    'New conversation',
  );
  const rail = actionButton('wb-rail-toggle', 'rail', options.onToggleRail);
  rail.setAttribute(
    'aria-label',
    layout.rail ? 'Expand sidebar' : 'Collapse sidebar',
  );
  rail.title = layout.rail ? 'Expand sidebar' : 'Collapse sidebar';
  rail.setAttribute('aria-expanded', String(!layout.rail));
  rail.append(workbenchIcon('sidebar'));
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

  nav.replaceChildren(
    top,
    group('conversations', 'Conversations', conversations),
    ...lessonGroups,
  );
  if (restore)
    [...nav.querySelectorAll<HTMLElement>('[data-nav-key]')]
      .find((node) => node.dataset.navKey === restore)
      ?.focus();
}
