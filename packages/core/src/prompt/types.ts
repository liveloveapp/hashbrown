import { ComponentTree } from '../ui';
import { HashbrownType } from '../schema/base';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type PromptDiagnosticSeverity = 'error' | 'warning';

export type PromptDiagnosticCode =
  | 'E1001' // UnknownTag
  | 'E1102' // MissingProp
  | 'E1203' // PropType
  | 'E1301' // Unserializable
  | 'E1401' // DuplicateAttr
  | 'W2001' // ExtraProp
  | 'W2101'; // ChildrenPolicy

export interface PromptDiagnostic {
  code: PromptDiagnosticCode;
  severity: PromptDiagnosticSeverity;
  message: string;
  start: number; // absolute offset in full prompt text
  end: number; // absolute offset in full prompt text
  line: number; // 1-based
  column: number; // 1-based
  snippet: string;
}

export type HBTree = ComponentTree[];

export type UiAstNode =
  | {
      kind: 'element';
      tag: string;
      start: number;
      end: number;
      attrs: Record<string, { value: string; start: number; end: number }>;
      children: UiAstNode[];
      selfClosing: boolean;
    }
  | {
      kind: 'text';
      text: string;
      start: number;
      end: number;
    };

export type UiBlock = {
  start: number; // absolute start of <ui>
  end: number; // absolute end of </ui>
  innerStart: number; // absolute start of block inner content
  innerEnd: number; // absolute end of block inner content
  source: string; // inner content
  ast: UiAstNode[];
};

export type SystemPrompt = {
  compile: (components: readonly any[], schema: HashbrownType) => string;
  examples: HBTree[];
  diagnostics: PromptDiagnostic[];
  meta: { uiBlocks: Array<{ start: number; end: number; source: string }> };
};
