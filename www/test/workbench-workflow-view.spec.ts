// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import { getWorkbenchLesson } from '../examples/quickstart/runtime/workbench-lessons';
import { mountWorkbench } from '../examples/quickstart/runtime/workbench-view';

test('activity and approval lessons focus their actual SDK inspector with application-owned UI', () => {
  for (const [id, tab] of [
    ['activities', 'Activities'],
    ['interrupts', 'Interrupts'],
  ]) {
    const host = document.createElement('div');
    const shell = mountWorkbench(host, createWorkbenchStore('workflow'), {
      framework: 'React',
      lesson: getWorkbenchLesson(`?lesson=${id}`),
      send: vi.fn(),
      stop: vi.fn(),
      reset: vi.fn(),
    });

    expect(host.querySelector('textarea')?.value).toBe(
      'Explain this two-step plan.',
    );
    expect(
      host.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
    ).toBe(tab);
    expect(host.textContent).toContain(
      id === 'activities' ? 'SDK activities' : 'SDK pending interrupt batch',
    );
    const ui = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'UI',
    );
    if (!ui) throw new Error('Missing UI tab');
    ui.click();

    expect(host.textContent).toContain('Application-owned workflow controls');
    expect(host.textContent).not.toContain('SummaryCard');
    shell.dispose();
  }
});
