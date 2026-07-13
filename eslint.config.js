const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const features = ['auth', 'grade', 'schedule', 'traffic', 'tutoring'];

const crossFeatureOverrides = features.map((feature) => ({
  files: [
    `src/features/${feature}/{domain,application,infrastructure,state,presentation}/**/*.{ts,tsx}`,
  ],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: features
          .filter((candidate) => candidate !== feature)
          .map((candidate) => ({
            group: [
              `@/features/${candidate}/**`,
              `../../${candidate}/**`,
              `../../../${candidate}/**`,
              `../../../../features/${candidate}/**`,
            ],
            message: `Cross-feature imports must use @/features/${candidate}.`,
          })),
      },
    ],
  },
}));

module.exports = defineConfig([
  globalIgnores([
    'node_modules/**',
    'expo-ios26-app-demo-master/**',
    '.expo/**',
    '.expo-export-*/**',
    'dist/**',
    'coverage/**',
    'scripts/schedule-1208-debug/**',
    '.codex/**',
    '.agents/**',
    '.superpowers/**',
    '.worktrees/**',
  ]),
  expoConfig,
  {
    files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  {
    files: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
    rules: {
      'import/first': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'react/display-name': 'off',
    },
  },
  {
    files: ['scripts/**/*.{js,cjs,mjs,ts}'],
    languageOptions: {
      globals: {
        __dirname: 'readonly',
      },
    },
  },
  {
    files: ['scripts/inspect-schedule-1208.cjs'],
    languageOptions: {
      globals: {
        gfOpenLink: 'readonly',
      },
    },
  },
  {
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/**', '../../features/**', '../../../features/**'],
              message: 'Core modules cannot import feature implementations.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/*/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'Domain code must stay framework-free.' },
            { name: 'react-native', message: 'Domain code must stay framework-free.' },
            { name: 'zustand', message: 'Domain code must stay state-library-free.' },
            {
              name: '@react-native-async-storage/async-storage',
              message: 'Domain code cannot persist data.',
            },
            { name: 'react-native-webview', message: 'Domain code cannot own transport.' },
          ],
          patterns: [
            { group: ['expo-*'], message: 'Domain code cannot import Expo APIs.' },
            {
              group: [
                '../application/**',
                '../infrastructure/**',
                '../state/**',
                '../presentation/**',
              ],
              message: 'Domain dependencies point inward only.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/*/application/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            '@react-native-async-storage/async-storage',
            'expo-secure-store',
            'react-native-webview',
            'zustand',
          ],
          patterns: [
            { group: ['expo-*'], message: 'Application code depends on ports, not Expo APIs.' },
            {
              group: ['../infrastructure/**', '../state/**', '../presentation/**'],
              message: 'Application code cannot depend on outer feature layers.',
            },
          ],
        },
      ],
    },
  },
  ...crossFeatureOverrides,
]);
