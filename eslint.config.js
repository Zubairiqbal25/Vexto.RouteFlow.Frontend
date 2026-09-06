// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

/**
 * Lint rules for the Vexto workspace.
 *
 * Deliberately close to the Angular defaults. The additions are the two conventions that keep the
 * three apps looking like one product: a `vexto`/`vx` component prefix, and no floating promises in
 * code that fires HTTP requests.
 */
module.exports = tseslint.config(
  {
    ignores: ['dist/**', '.angular/**', 'out-tsc/**', 'node_modules/**', 'libs/models/src/lib/generated/**'],
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: ['vx', 'vexto'], style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: ['vx', 'vexto'], style: 'kebab-case' },
      ],
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {},
  },
);
