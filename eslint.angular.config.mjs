import angularPlugin from '@angular-eslint/eslint-plugin';
import angularTemplatePlugin from '@angular-eslint/eslint-plugin-template';
import angularTemplateParser from '@angular-eslint/template-parser';
import typescriptEslint from 'typescript-eslint';

/**
 * Shared Angular flat ESLint configuration that preserves the pre-Angular-22
 * rule baseline while using the scoped v22 plugin and parser packages.
 *
 * The v22 `prefer-on-push-component-change-detection` policy is intentionally
 * deferred because adopting OnPush changes runtime change-detection behavior.
 */
export const angularConfig = [
  {
    name: 'hashbrown/angular-typescript',
    files: ['**/*.ts'],
    languageOptions: {
      parser: typescriptEslint.parser,
      sourceType: 'module',
    },
    plugins: {
      '@angular-eslint': angularPlugin,
    },
    processor: angularTemplatePlugin.processors['extract-inline-html'],
    rules: {
      '@angular-eslint/contextual-lifecycle': 'error',
      '@angular-eslint/no-empty-lifecycle-method': 'error',
      '@angular-eslint/no-input-rename': 'error',
      '@angular-eslint/no-inputs-metadata-property': 'error',
      '@angular-eslint/no-output-native': 'error',
      '@angular-eslint/no-output-on-prefix': 'error',
      '@angular-eslint/no-output-rename': 'error',
      '@angular-eslint/no-outputs-metadata-property': 'error',
      '@angular-eslint/prefer-inject': 'error',
      '@angular-eslint/prefer-standalone': 'error',
      '@angular-eslint/use-lifecycle-interface': 'warn',
      '@angular-eslint/use-pipe-transform-interface': 'error',
    },
  },
  {
    name: 'hashbrown/angular-template',
    files: ['**/*.html'],
    languageOptions: {
      parser: angularTemplateParser,
    },
    plugins: {
      '@angular-eslint/template': angularTemplatePlugin,
    },
    rules: {
      '@angular-eslint/template/alt-text': 'error',
      '@angular-eslint/template/banana-in-box': 'error',
      '@angular-eslint/template/click-events-have-key-events': 'error',
      '@angular-eslint/template/elements-content': 'error',
      '@angular-eslint/template/eqeqeq': 'error',
      '@angular-eslint/template/interactive-supports-focus': 'error',
      '@angular-eslint/template/label-has-associated-control': 'error',
      '@angular-eslint/template/mouse-events-have-key-events': 'error',
      '@angular-eslint/template/no-autofocus': 'error',
      '@angular-eslint/template/no-distracting-elements': 'error',
      '@angular-eslint/template/no-negated-async': 'error',
      '@angular-eslint/template/prefer-control-flow': 'error',
      '@angular-eslint/template/role-has-required-aria': 'error',
      '@angular-eslint/template/table-scope': 'error',
      '@angular-eslint/template/valid-aria': 'error',
    },
  },
];

export default angularConfig;
