import type { RunAgentInput } from '@ag-ui/core';
import { type Browser, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { WorkbenchAgentTrace } from '../../examples/quickstart/runtime/workbench-agent';
import type { WorkbenchAuthoringObservation } from '../../examples/quickstart/runtime/workbench-authoring';
import {
  expectNoHorizontalOverflow,
  expectWorkbenchDefaultLayout,
} from './verify-workbench-layout';

/** Controlled negative cases are confined to the labelled provider fixture. */
export type AuthoringFixtureOutcome =
  | 'success'
  | 'malformed'
  | 'missing'
  | 'wrong-type'
  | 'truncated'
  | 'error'
  | 'length';
/** Controlled classifier outcomes are confined to deterministic browser verification. */
export type AgentFixtureOutcome =
  'success' | 'low' | 'invalid' | 'unavailable' | 'error' | 'delay';

/** Verifies real SDK/parser conversation flows and explicit form actions before publication. */
export async function verifyAuthoringWorkbench(options: {
  readonly browser: Browser;
  readonly framework: string;
  readonly lesson: 'agent-decisions' | 'json-parser' | 'natural-forms';
  readonly origin: string;
  readonly work: string;
  readonly live: boolean;
  readonly recording: boolean;
  readonly requests: readonly RunAgentInput[];
  readonly agentRequests: readonly { readonly state: string }[];
  readonly authoringOutcome: (value: AuthoringFixtureOutcome) => void;
  readonly agentOutcome: (value: AgentFixtureOutcome) => void;
}) {
  const { framework, lesson, live, recording, work } = options;
  const agent = lesson === 'agent-decisions',
    forms = lesson === 'natural-forms';
  const page = await options.browser.newPage({
    viewport: { width: 1600, height: 1000 },
    ...(recording
      ? { recordVideo: { dir: work, size: { width: 1600, height: 1000 } } }
      : {}),
  });
  const base = `${framework}-${lesson}-${live ? 'live' : 'fixture'}`;
  const started = Date.now(),
    phases: Record<string, number> = {};
  const mark = (name: string) => {
    phases[name] = (Date.now() - started) / 1000;
  };
  const hold = async () => {
    if (recording) await page.waitForTimeout(2000);
  };
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let http = 0;
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/workbench/')) http++;
  });
  const start = options.requests.length,
    agentStart = options.agentRequests.length;
  const count = () => options.requests.length - start;
  let succeeded = false;
  const agentFallbacks: boolean[] = [];
  const agentConfidences: number[] = [];
  let formFirstStepPreserved: boolean | undefined;
  try {
    await page.goto(`${options.origin}/${framework}.html?lesson=${lesson}`);
    const root = page.locator('.wb:visible');
    const button = (name: string) =>
      root.getByRole('button', { name, exact: true });
    const send = root.locator('[data-send]');
    const tab = async (name: string) => {
      await root.getByRole('tab', { name, exact: true }).click();
    };
    const inspection = async () =>
      JSON.parse(
        await root.locator('.wb-inspector .wb-inspection pre').innerText(),
      );
    const detail = async () =>
      JSON.parse(
        await root.locator('.wb-inspector [data-detail] pre').innerText(),
      );
    const parser = async () => {
      await tab('Parser');
      return { ...(await inspection()), ...(await detail()) } as {
        source: WorkbenchAuthoringObservation['source'];
        parser: WorkbenchAuthoringObservation['parser'];
        document: WorkbenchAuthoringObservation['document'];
      };
    };
    const form = async () => {
      await tab('Form');
      return { ...(await inspection()), ...(await detail()) } as {
        document: WorkbenchAuthoringObservation['document'];
        reviewed: WorkbenchAuthoringObservation['reviewed'];
        appliedPlan: WorkbenchAuthoringObservation['document'];
        revision: number;
        applied: boolean;
        error: string | null;
      };
    };
    const trace = async () => {
      await tab('Agent');
      return (await inspection()) as WorkbenchAgentTrace;
    };
    const complete = async () => {
      await expect(root.locator('.wb-chat .wb-panel-head')).toContainText(
        'complete',
        { timeout: 90_000 },
      );
      await expect(send).toBeEnabled();
      if (!agent)
        await expect
          .poll(async () => (await parser()).document, { timeout: 15_000 })
          .not.toBeNull();
    };
    const newConversation = async () => {
      const selected = root.locator('.wb-nav [aria-pressed=true]');
      const previous = await selected.innerText();
      await button('New conversation').click();
      await expect(selected).not.toHaveText(previous);
      await expect(send).toBeEnabled();
    };
    const allJson: string[] = [];
    await page.exposeFunction('__authoringObservation', (text: string) =>
      allJson.push(text),
    );
    await page.evaluate(() => {
      const root = document.querySelector('.wb');
      if (!root) return;
      const observer = new MutationObserver(() => {
        const pre = root.querySelector('.wb-inspector .wb-inspection pre');
        if (pre)
          void (
            window as unknown as {
              __authoringObservation: (text: string) => Promise<void>;
            }
          ).__authoringObservation(pre.textContent ?? '');
      });
      observer.observe(root, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    });
    await expect(send).toBeEnabled();
    await expectWorkbenchDefaultLayout(page);
    // Keep the selected recipe visible through the normal sidebar control.
    const concepts = root.getByRole('button', {
      name: 'Concepts',
      exact: true,
    });
    if ((await concepts.getAttribute('aria-expanded')) === 'true')
      await concepts.click();
    await expect(root.locator('.wb-nav [aria-current=page]')).toBeInViewport();
    expect(count()).toBe(0);
    expect(http).toBe(0);
    if (forms) await expect(button('Review draft')).toBeDisabled();
    await hold();
    await send.click();
    if (forms) await expect(button('Review draft')).toBeDisabled();
    await complete();
    await expect(root.locator('[data-source]')).toHaveText(
      live ? 'Live model' : 'Test fixture',
    );
    const firstPlan = agent ? null : (await parser()).document;
    if (agent) {
      const first = await trace();
      expect(first.value?.route).toBe('outline');
      const score = first.meta?.route.confidence;
      if (
        typeof score !== 'number' ||
        !Number.isFinite(score) ||
        score < 0 ||
        score > 1
      )
        throw new Error('Missing actual agent confidence');
      const fallback = score < 0.75;
      expect(first.handler).toBe(fallback ? 'clarify' : 'outline');
      expect(first.fallback).toBe(fallback ? 'low-confidence' : null);
      agentFallbacks.push(fallback);
      agentConfidences.push(score);
      await expect(root.locator('.wb-history-reply')).toContainText(
        fallback ? 'Please clarify' : 'Outline handler',
      );
      await expect(root.locator('[role=alert]')).not.toContainText(
        'not a valid two-step plan',
      );
    } else {
      expect(firstPlan?.steps).toHaveLength(2);
      await expect(root.locator('[data-authoring-status]')).toContainText(
        'Original document valid',
      );
      // At least one actual captured parser observation must precede successful source completion.
      expect(
        allJson.some((text) => {
          try {
            const v = JSON.parse(text);
            return (
              v.source === 'generating' &&
              v.parser?.complete === false &&
              v.parser?.value?.steps?.some(
                (s: unknown) => typeof s === 'string' && s.length > 0,
              )
            );
          } catch {
            return false;
          }
        }),
      ).toBe(true);
    }
    await hold();
    mark('firstComplete');
    if (forms) {
      await button('Review draft').click();
      await expect(
        root.getByLabel('First step', { exact: true }),
      ).toBeEnabled();
      expect((await form()).reviewed).toEqual(firstPlan);
      await hold();
      mark('reviewed');
      await root
        .getByLabel('First step', { exact: true })
        .fill('Outline the demo');
      expect((await form()).revision).toBe(0);
      await hold();
      mark('edited');
      await button('Apply plan').click();
      await expect.poll(async () => (await form()).revision).toBe(1);
      expect((await form()).appliedPlan?.steps[0]).toBe('Outline the demo');
      await expect(button('Apply plan')).toBeDisabled();
      await hold();
      mark('applied');
    }
    await tab(agent ? 'Agent' : forms ? 'Form' : 'Parser');
    await hold();
    mark('followup');
    await button('Follow-up').click();
    await send.click();
    if (forms) {
      await expect(button('Apply plan')).toBeDisabled();
      await expect(button('Review draft')).toBeDisabled();
    }
    await complete();
    if (forms) {
      const latestTool = options.requests
        .slice(start)
        .flatMap((request) => request.messages)
        .filter((message) => message.role === 'tool')
        .at(-1);
      const context =
        typeof latestTool?.content === 'string'
          ? latestTool.content
          : JSON.stringify(latestTool?.content);
      expect(context).toContain('Outline the demo');
      expect(context).toContain('"revision":1');
    }
    if (agent) {
      const next = await trace();
      expect(next.value?.route).toBe('record');
      const score = next.meta?.route.confidence;
      if (
        typeof score !== 'number' ||
        !Number.isFinite(score) ||
        score < 0 ||
        score > 1
      )
        throw new Error('Missing actual agent confidence');
      const fallback = score < 0.75;
      expect(next.handler).toBe(fallback ? 'clarify' : 'record');
      expect(next.fallback).toBe(fallback ? 'low-confidence' : null);
      agentFallbacks.push(fallback);
      agentConfidences.push(score);
      await expect(root.locator('.wb-history-reply').last()).toContainText(
        fallback ? 'Please clarify' : 'Record handler',
      );
    } else {
      const next = (await parser()).document;
      if (forms) {
        formFirstStepPreserved = next?.steps[0] === 'Outline the demo';
        if (!live) expect(formFirstStepPreserved).toBe(true);
      } else {
        expect(next?.steps[0]).toBe(firstPlan?.steps[0]);
      }
      expect(next?.steps[1].length).toBeLessThanOrEqual(
        firstPlan?.steps[1].length ?? 0,
      );
    }
    await tab(agent ? 'Agent' : forms ? 'Form' : 'Parser');
    await hold();
    mark('secondComplete');
    if (forms) {
      await button('Review draft').click();
      await expect(
        root.getByLabel('First step', { exact: true }),
      ).toBeEnabled();
      await hold();
      mark('secondReviewed');
      if (!formFirstStepPreserved) {
        await root
          .getByLabel('First step', { exact: true })
          .fill('Outline the demo');
      }
      await expect(root.getByLabel('First step', { exact: true })).toHaveValue(
        'Outline the demo',
      );
      expect((await form()).revision).toBe(1);
      await hold();
      mark('secondCorrected');
      await button('Apply plan').click();
      await expect.poll(async () => (await form()).revision).toBe(2);
      await hold();
      mark('secondApplied');
    }
    const captured = options.requests.slice(start);
    expect(captured).toHaveLength(forms ? 4 : 2);
    expect(new Set(captured.map((r) => r.threadId)).size).toBe(1);
    expect(new Set(captured.map((r) => r.runId)).size).toBe(captured.length);
    expect(
      new Set(
        captured.map(
          (r) => r.messages.filter((m) => m.role === 'user').at(-1)?.id,
        ),
      ).size,
    ).toBe(2);
    const classifierCount = options.agentRequests.length - agentStart;
    expect(classifierCount).toBe(agent ? 2 : 0);
    if (forms) {
      const toolMessages = captured
        .flatMap((r) => r.messages)
        .filter((m) => m.role === 'tool');
      const toolText = toolMessages
        .map((m) =>
          typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        )
        .join('\n');
      expect(toolText).toContain('Outline the demo');
      expect(toolText).toContain('"revision":1');
      await tab('State');
      expect(await inspection()).toMatchObject({
        revision: 2,
        plan: { steps: ['Outline the demo', expect.any(String)] },
      });
    } else {
      await tab('State');
      expect(await inspection()).toMatchObject({ revision: 0 });
    }
    await tab(agent ? 'Agent' : forms ? 'Form' : 'Parser');
    const before = {
      http,
      count: count(),
      classifiers: options.agentRequests.length,
      state: await inspection(),
      detail: await detail(),
    };
    await hold();
    mark('replay');
    await button('Play').click();
    await expect(send).toBeDisabled();
    await hold();
    if (await button('Pause').count()) await button('Pause').click();
    await root.getByRole('slider', { name: 'Seek captured event' }).fill('0');
    if (forms) {
      for (const name of ['Review draft', 'Apply plan']) {
        await expect(button(name)).toBeDisabled();
        await button(name).dispatchEvent('click');
      }
      const input = root.getByLabel('First step', { exact: true });
      await expect(input).toBeDisabled();
      await input.dispatchEvent('input');
    }
    await hold();
    await button('Return to live').click();
    await hold();
    mark('returnedLive');
    expect(http).toBe(before.http);
    expect(count()).toBe(before.count);
    expect(options.agentRequests.length).toBe(before.classifiers);
    expect(await inspection()).toEqual(before.state);
    expect(await detail()).toEqual(before.detail);
    await hold();
    await page.screenshot({
      path: resolve(work, `${base}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    if (!live) {
      if (agent) {
        for (const mode of ['low', 'invalid', 'unavailable'] as const) {
          await newConversation();
          options.agentOutcome(mode);
          await send.click();
          await complete();
          expect((await trace()).handler).toBe('clarify');
          await expect(root.locator('.wb-history-reply')).toContainText(
            'Please clarify',
          );
        }
        await newConversation();
        options.agentOutcome('error');
        await send.click();
        await expect(root.locator('.wb-chat .wb-panel-head')).toContainText(
          'error',
          { timeout: 15_000 },
        );
        options.agentOutcome('success');
        await button('First prompt').click();
        await send.click();
        await complete();
        await newConversation();
        options.agentOutcome('delay');
        await send.click();
        await expect(button('Stop')).toBeEnabled();
        await button('Stop').click();
        await expect(root.locator('.wb-chat .wb-panel-head')).toContainText(
          'cancelled',
        );
        await page.waitForTimeout(800);
        await expect(root.locator('.wb-history-reply')).toHaveCount(0);
        options.agentOutcome('success');
      } else {
        for (const mode of [
          'malformed',
          'missing',
          'wrong-type',
          'truncated',
          'error',
          'length',
        ] as const) {
          await newConversation();
          options.authoringOutcome(mode);
          await send.click();
          await expect(root.locator('.wb-chat .wb-panel-head')).toContainText(
            mode === 'error' || mode === 'length' ? 'error' : 'complete',
            { timeout: 20_000 },
          );
          await expect.poll(async () => (await parser()).document).toBeNull();
          if (forms) await expect(button('Review draft')).toBeDisabled();
        }
        options.authoringOutcome('success');
        await newConversation();
        await send.click();
        await complete();
        // A failed replacement and retry stay in the same SDK conversation.
        const retryThread = options.requests.at(-1)?.threadId;
        const retainedPlan = forms ? (await form()).appliedPlan : null;
        options.authoringOutcome('error');
        await button('Follow-up').click();
        await send.click();
        await expect(root.locator('.wb-chat .wb-panel-head')).toContainText(
          'error',
          { timeout: 20000 },
        );
        expect((await parser()).document).toBeNull();
        await expect(root.locator('[data-authoring-preview] h3')).toHaveText(
          '',
        );
        if (forms) expect((await form()).appliedPlan).toEqual(retainedPlan);
        options.authoringOutcome('success');
        await button('Follow-up').click();
        await send.click();
        await complete();
        expect(options.requests.at(-1)?.threadId).toBe(retryThread);
        if (forms) {
          await button('Review draft').click();
          await root.getByLabel('First step', { exact: true }).fill('   ');
          await button('Apply plan').click();
          expect((await form()).revision).toBe(0);
          await expect(
            root.getByLabel('First step', { exact: true }),
          ).toBeEnabled();
          await root
            .getByLabel('First step', { exact: true })
            .fill('Outline corrected');
          await button('Apply plan').click();
          expect((await form()).revision).toBe(1);
        }
        await newConversation();
        await send.click();
        await expect(button('Stop')).toBeEnabled();
        await page.waitForTimeout(150);
        await button('Stop').click();
        await expect(root.locator('.wb-chat .wb-panel-head')).toContainText(
          'cancelled',
        );
        const stoppedCount = count();
        await page.waitForTimeout(800);
        await expect(root.locator('[data-authoring-status]')).toContainText(
          'Source: stopped',
        );
        expect((await parser()).source).toBe('stopped');
        expect((await parser()).document).toBeNull();
        expect(count()).toBe(stoppedCount);
        if (forms) await expect(button('Apply plan')).toBeDisabled();
      }
    }
    if (!recording) {
      await page.setViewportSize({ width: 390, height: 844 });
      await expectNoHorizontalOverflow(page);
    }
    expect(errors).toEqual([]);
    succeeded = true;
    return {
      framework,
      lesson,
      passed: true,
      source: live ? 'provider' : 'test-fixture',
      provider: agent ? 'typesafe' : 'openai',
      ...(agent ? { agentFallbacks, agentConfidences } : {}),
      ...(forms ? { formFirstStepPreserved } : {}),
      phases,
      requests: captured.length,
      classifierRequests: classifierCount,
      replayRequests: 0,
      replayWrites: 0,
      eventDelayMs: recording ? 20 : 0,
    };
  } catch (error) {
    await page
      .screenshot({
        path: resolve(work, `${base}-failure.png`),
        fullPage: true,
      })
      .catch(() => undefined);
    writeFileSync(
      resolve(work, `${base}-failure.json`),
      JSON.stringify(
        {
          framework,
          lesson,
          phases,
          http,
          requests: count(),
          errors,
          error: String(error),
          publicUI: await page
            .locator('body')
            .innerText()
            .catch(() => ''),
        },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    options.authoringOutcome('success');
    options.agentOutcome('success');
    const video = page.video();
    await page.close();
    if (video)
      await video.saveAs(
        resolve(work, `${base}${succeeded ? '' : '-failed'}.webm`),
      );
  }
}
