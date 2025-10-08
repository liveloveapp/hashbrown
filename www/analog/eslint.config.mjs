import baseConfig from '../../eslint.config.mjs';
import angularPlugin from '@angular-eslint/eslint-plugin';

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'warn',
        {
          ignoredFiles: ['{projectRoot}/eslint.config.{js,cjs,mjs}'],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
  {
    files: ['**/*.ts'],
    plugins: { '@angular-eslint': angularPlugin },
    rules: {
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: ['app', 'www'],
          style: 'kebab-case',
        },
      ],
    },
  },
  {
    files: ['*.html'],
    extends: ['plugin:@nx/angular-template'],
    rules: {},
  },
  {
    files: ['*.md'],
    extends: ['plugin:markdown/recommended'],
  },
];
