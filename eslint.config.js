// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

/**
 * Lint rules for the Vexto workspace.
 *
 * Deliberately close to the Angular defaults. The additions are the conventions that keep the three
 * apps looking like one product — a `vexto`/`vx` component prefix — and the library dependency
 * direction, which is the one architectural rule the frontend has and the one thing a linter can
 * actually enforce here.
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
    // The layering, enforced.
    //
    // `@vexto/models` and `@vexto/utilities` are the floor: they are plain types and pure
    // functions, and anything they imported would be dragged into every app that uses one.
    // `@vexto/ui` sits above them and below the API client — a design-system library that knew how
    // to make an HTTP request would be a design-system library nobody could reuse, which is exactly
    // why `VxPicker` takes a `search` function from its caller rather than injecting an API.
    files: ['libs/ui/**/*.ts', 'libs/models/**/*.ts', 'libs/utilities/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@vexto/api-client', '@vexto/auth', '@vexto/permissions', '@vexto/layouts'],
              message:
                '@vexto/ui, models and utilities sit below the API client. Take what you need as an ' +
                'input or an injection token instead — see VX_PHOTO_RESOLVER and VxPickerSearch.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['libs/models/**/*.ts', 'libs/utilities/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@vexto/*'],
              message: '@vexto/models and @vexto/utilities are the floor of the dependency graph.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {},
  },
);
