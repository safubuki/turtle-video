const js = require('@eslint/js');
const globals = require('globals');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = [
  {
    ignores: ['dist', 'node_modules', 'coverage'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.es2020,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'no-undef': 'off',
      'no-redeclare': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // ==================== フレーバー分離ガード ====================
  // iOS Safari (apple-safari) と Android/PC (standard) のルートが互いに
  // 影響しないよう、import 境界を機械的に強制する。

  // 1) standard フレーバーから apple-safari フレーバーへの依存を禁止
  {
    files: ['src/flavors/standard/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/flavors/apple-safari/**'],
          message: 'standard フレーバーは apple-safari フレーバーに依存してはいけない（ルート分離違反）。',
        }],
      }],
    },
  },

  // 2) apple-safari フレーバーから standard フレーバーへの依存を禁止
  {
    files: ['src/flavors/apple-safari/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/flavors/standard/**'],
          message: 'apple-safari フレーバーは standard フレーバーに依存してはいけない（ルート分離違反）。',
        }],
      }],
    },
  },

  // 3) 共有コード（components/hooks/utils/stores）から flavor 実装への依存を禁止
  //    （フレーバー選択は src/App.tsx / src/app のみが行う）
  {
    files: [
      'src/components/**/*.{ts,tsx}',
      'src/hooks/**/*.{ts,tsx}',
      'src/utils/**/*.{ts,tsx}',
      'src/stores/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/flavors/**'],
          message: '共有コードは特定フレーバーの実装に依存してはいけない。契約型は hooks/export-strategies/types 等の中立モジュールへ置くこと。',
        }],
      }],
    },
  },

  // 4) 共有コンポーネント: 直接 UA 判定の禁止（Context 経由で受け取る）＋凍結レガシー誤用防止
  //    ※ flat config は同一ルールキーを上書きマージするため、コンポーネント向け制限は
  //      1 つの設定オブジェクトにまとめること（分割すると後勝ちで前の制限が消える）。
  {
    files: ['src/components/**/*.{ts,tsx}'],
    ignores: ['src/components/turtle-video/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['**/utils/platform'],
            importNames: ['getPlatformCapabilities'],
            allowTypeImports: true,
            message: '共有コンポーネントでは getPlatformCapabilities() を直接呼ばず、PlatformCapabilitiesContext の usePlatformCapabilities() を使うこと。',
          },
          {
            group: [
              '**/components/turtle-video/usePreviewEngine',
              '**/components/turtle-video/usePreviewAudioSession',
              '**/components/turtle-video/useInactiveVideoManager',
              '**/components/turtle-video/usePreviewSeekController',
              '**/components/turtle-video/usePreviewVisibilityLifecycle',
              '**/utils/previewPlatform',
              '**/utils/iosSafariAudio',
            ],
            allowTypeImports: true,
            message: '凍結済みレガシー実装は import しない。実装は src/flavors/<flavor>/preview/ のフレーバー別コピーを使うこと。',
          },
        ],
      }],
    },
  },

  // 5) コンポーネント以外（app / flavors / hooks / utils / stores 等）でも
  //    凍結済みレガシー実装（フォーク元）の値 import を禁止（テストと契約型定義元を除く）
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/test/**', 'src/components/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        patterns: [{
          group: [
            '**/components/turtle-video/usePreviewEngine',
            '**/components/turtle-video/usePreviewAudioSession',
            '**/components/turtle-video/useInactiveVideoManager',
            '**/components/turtle-video/usePreviewSeekController',
            '**/components/turtle-video/usePreviewVisibilityLifecycle',
            '**/utils/previewPlatform',
            '**/utils/iosSafariAudio',
          ],
          allowTypeImports: true,
          message: '凍結済みレガシー実装は import しない。実装は src/flavors/<flavor>/preview/ のフレーバー別コピーを使うこと。',
        }],
      }],
    },
  },
];
