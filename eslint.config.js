import js from '@eslint/js';
import globals from 'globals';
export default [
  { ignores: ['dist*/**', 'node_modules/**', 'release/**', 'work/**', 'test-results/**'] },
  js.configs.recommended,
  { rules: { 'no-empty': ['error', { allowEmptyCatch: true }] } },
  {
    files: ['src/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        chrome: 'readonly',
        __MARGIN_TARGET__: 'readonly',
        __MARGIN_WEB_CLIENT_ID__: 'readonly',
      },
    },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }] },
  },
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs', 'eslint.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        chrome: 'readonly',
        browser: 'readonly',
        window: 'readonly',
        innerWidth: 'readonly',
        innerHeight: 'readonly',
        Services: 'readonly',
        Ci: 'readonly',
        document: 'readonly',
        getSelection: 'readonly',
        MouseEvent: 'readonly',
        HTMLAnchorElement: 'readonly',
        CSS: 'readonly',
      },
    },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }] },
  },
];
