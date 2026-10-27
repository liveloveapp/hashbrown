import type { WorkbenchSnapshot } from './workbench';
import {
  workbenchAuthoringSchema,
  workbenchAuthoringSource,
} from './workbench-authoring';
import { s } from '@hashbrownai/core';

/** Projects captured parser/form/agent values; inspection never invokes a parser, provider or application action. */
export function workbenchAuthoringInspection(
  tab: string,
  snapshot: WorkbenchSnapshot,
  lesson: string | undefined,
) {
  const history = snapshot.frame?.history;
  const app = snapshot.frame?.application ?? snapshot.application;
  if (lesson === 'agent-decisions') {
    if (tab !== 'Agent') return undefined;
    return {
      heading: 'Actual server decision and selected handler',
      value: history?.agent ?? null,
      detailHeading: 'Read-only agent boundary',
      detail: {
        modelOutput: 'Whole route decision',
        replySource: 'Application-owned read-only handler',
        revision: app.revision,
        applicationPlan: app.plan,
        note: 'A closed route and finite confidence select fixed server code. Confidence does not establish correctness or authorization.',
      },
    };
  }
  if (lesson !== 'json-parser' && lesson !== 'natural-forms') return undefined;
  const authoring = history?.authoring;
  const source = workbenchAuthoringSource(snapshot);
  const document = source === 'complete' ? (authoring?.document ?? null) : null;
  const draft = {
    source,
    parser: authoring?.parser ?? null,
  };
  const detail = {
    document,
    origin: authoring?.origin ?? null,
    error: authoring?.error ?? null,
    note: 'Last captured parser values; source status follows the selected SDK frame. Parser completion alone does not establish a valid finished source.',
  };
  if (tab === 'Parser')
    return {
      heading: 'Captured framework parser observation',
      value: draft,
      detailHeading: 'Original document and request origin',
      detail,
    };
  if (tab === 'JSON')
    return {
      heading: 'Actual accumulated assistant JSON',
      value: authoring?.json ?? '',
      detailHeading: 'Parser and original document',
      detail: { ...draft, ...detail },
    };
  if (tab === 'Schema')
    return {
      heading: 'Shared response and parser schema',
      value: s.toJsonSchema(workbenchAuthoringSchema),
      detailHeading: 'Application validation',
      detail: {
        title: '1–120 trimmed characters',
        steps: 'Exactly two steps, 1–200 trimmed characters each',
        originalDocument: document,
      },
    };
  if (tab === 'Form' && lesson === 'natural-forms')
    return {
      heading: 'Generated draft',
      value: { ...draft, document },
      detailHeading: 'Reviewed fields and applied plan',
      detail: {
        reviewed: authoring?.reviewed ?? null,
        appliedPlan: app.plan,
        revision: app.revision,
        applied: authoring?.applied ?? false,
        error: authoring?.error ?? null,
        note: 'Only explicit validated Apply changes application state.',
      },
    };
  if (tab === 'UI')
    return {
      heading:
        lesson === 'natural-forms'
          ? 'Application form'
          : 'Application parser preview',
      value: {
        renderer:
          lesson === 'natural-forms'
            ? 'Application form'
            : 'Application parser preview',
        generatedComponents: false,
        preview:
          source === 'error' || authoring?.parser.error
            ? null
            : (authoring?.parser.value ?? null),
      },
      detailHeading: 'Application rendering boundary',
      detail: {
        appliedPlan: app.plan,
        revision: app.revision,
        note:
          lesson === 'natural-forms'
            ? 'Generated data, reviewed fields and the applied plan are separate.'
            : 'A parsed preview never changes application state.',
      },
    };
  return undefined;
}
