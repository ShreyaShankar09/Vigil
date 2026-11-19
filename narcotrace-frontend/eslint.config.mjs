import tseslint from 'typescript-eslint'
import i18next from 'eslint-plugin-i18next'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'src/locales/**', '**/*.test.tsx'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': ['error', {
        mode: 'jsx-only',
        'jsx-attributes': {
          include: [],
          exclude: [
            'className', 'styleName', 'style', 'type', 'key', 'id', 'width', 'height',
            'to', 'path', 'href', 'src', 'value', 'name', 'autoComplete', 'inputMode',
            'autoCapitalize', 'autoCorrect', 'enterKeyHint', 'role', 'dir', 'lang',
            'fill', 'stroke', 'strokeWidth', 'viewBox', 'cx', 'cy', 'r', 'x', 'y',
            'd', 'points', 'xmlns', 'tabIndex', 'data-*', 'aria-hidden',
            'variant', 'size', 'tone', 'data-.*',
            'contentStyle', 'dataKey', 'nameKey', 'strokeDasharray', 'fontSize',
            'tickLine', 'axisLine', 'allowDecimals', 'shape', 'dot', 'radius',
          ],
        },
        callees: {
          include: [],
          exclude: [
            'i18next', 'i18n', 't', 'require', 'addEventListener', 'removeEventListener',
            'postMessage', 'getElementById', 'dispatch', 'commit', 'includes', 'indexOf',
            'endsWith', 'startsWith', 'push', 'setStep',
          ],
        },
      }],
    },
  },
)
