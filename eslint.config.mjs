import js from '@eslint/js';
import next from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/.next/**', '**/.next-e2e/**', '**/dist/**', 'web/next-env.d.ts', 'playwright-report/**', 'test-results/**', '**/data/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'off',
    },
  },
  { files: ['server/**/*.ts', 'e2e/**/*.ts', '*.mjs', 'web/*.mjs', 'web/*.ts'], languageOptions: { globals: globals.node } },
  {
    files: ['web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, '@next/next': next },
    languageOptions: { globals: { ...globals.browser, React: 'readonly' } },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      ...next.configs.recommended.rules,
      '@next/next/no-html-link-for-pages': 'off', // App Router: there is no pages/ directory
    },
  },
);
