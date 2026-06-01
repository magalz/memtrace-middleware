import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '*.js', '*.cjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.typescript,
  {
    settings: {
      'import/parsers': {
        '@typescript-eslint/parser': ['.ts'],
      },
      'import/resolver': {
        typescript: { alwaysTryTypes: true },
      },
    },
    rules: {
      'no-console': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='then']",
          message: 'Use async/await instead of .then()',
        },
        {
          selector: "CallExpression[callee.property.name='catch']",
          message: 'Use async/await with try/catch instead of .catch()',
        },
        {
          selector: "CallExpression[callee.object.name='Promise'][callee.property.name='all']",
          message: 'Use Promise.allSettled instead of Promise.all',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'import/order': [
        'error',
        {
          groups: [['builtin', 'external'], 'internal', ['parent', 'sibling', 'index']],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/first': 'error',
      'import/no-duplicates': 'error',
      'import/no-named-as-default': 'off',
      'import/no-unresolved': ['error', { ignore: ['@modelcontextprotocol/sdk'] }],
      'import/newline-after-import': 'error',
    },
  },
  {
    files: ['tests/**/*.test.ts'],
    rules: {
      'import/first': 'off',
      'import/order': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  }
);
