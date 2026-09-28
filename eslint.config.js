import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

// Static-analysis baseline for the Flipstar web app.
//
// Deliberately narrow. The point of this config is to surface CORRECTNESS
// problems -- hook rules, dependency arrays, undefined identifiers, dead
// bindings -- across 220 files and ~90k lines. Stylistic rules are left out on
// purpose: formatting opinions would produce hundreds of unrelated diffs and
// bury the findings that actually matter.
//
// Nothing here is auto-fixed. `exhaustive-deps` in particular is a WARNING and
// must stay one: some dependencies are omitted intentionally (a mount-only
// effect, a deliberately stale closure), and "fixing" those to satisfy the
// linter changes behaviour. Each finding gets read before anything changes.
export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      // Image/asset directories and build output -- no source to lint.
      'assets/**',
      'public/**',
      '.expo*/**',
    ],
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      // Hooks called conditionally or out of order are always a bug.
      'react-hooks/rules-of-hooks': 'error',
      // The §16 audit, mechanised: this enumerates the effects whose
      // dependency arrays do not match what they close over, instead of
      // reading 408 effects by hand.
      'react-hooks/exhaustive-deps': 'warn',
      // Dead bindings. `args: 'none'` because unused function parameters are
      // routine in event handlers and callbacks; `_`-prefixed names are an
      // explicit "intentionally unused" marker.
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      // A genuine runtime error every time it fires.
      'no-undef': 'error',
    },
  },
  {
    // Tests run under node and use the node: test runner.
    files: ['tests/**/*.{js,jsx,mjs}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
