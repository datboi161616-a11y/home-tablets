// Lint for mistakes, not for style: the things that only show up when somebody opens the
// one screen, at the one moment, where the broken line runs (a name that doesn't exist,
// a variable declared twice, a comparison that can never be true).
// Run through tools/check.sh; nothing to install.
const browser = Object.fromEntries([
  'window', 'document', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage', 'caches', 'fetch', 'console',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback',
  'addEventListener', 'removeEventListener', 'dispatchEvent', 'getComputedStyle', 'matchMedia', 'performance', 'innerWidth', 'innerHeight',
  'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'PointerEvent', 'Element', 'HTMLElement', 'HTMLMediaElement', 'Node', 'Image', 'Audio',
  'MutationObserver', 'IntersectionObserver', 'ResizeObserver', 'AbortController', 'AbortSignal', 'URL', 'URLSearchParams', 'Blob', 'File',
  'FileReader', 'FormData', 'Response', 'Request', 'Headers', 'TextDecoder', 'TextEncoder', 'atob', 'btoa', 'crypto', 'Intl', 'CSS',
  'MediaRecorder', 'MediaStream', 'AudioContext', 'SpeechRecognition', 'webkitSpeechRecognition', 'DOMParser', 'XMLHttpRequest', 'WebSocket', 'screen',
  'self', 'globalThis', 'queueMicrotask', 'alert', 'confirm', 'devicePixelRatio', 'scrollTo', 'visualViewport', 'ImageData', 'Path2D',
].map((name) => [name, 'readonly']));

const rules = {
  'no-undef': 'error',
  'no-redeclare': 'error',
  'no-const-assign': 'error',
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-dupe-else-if': 'error',
  'no-duplicate-case': 'error',
  'no-func-assign': 'error',
  'no-import-assign': 'error',
  'no-self-assign': 'error',
  'no-self-compare': 'error',
  'no-unreachable': 'error',
  'no-unsafe-negation': 'error',
  'no-unsafe-optional-chaining': 'error',
  'no-compare-neg-zero': 'error',
  'no-cond-assign': ['error', 'except-parens'],
  'no-loss-of-precision': 'error',
  'no-obj-calls': 'error',
  'no-setter-return': 'error',
  'no-sparse-arrays': 'error',
  'no-this-before-super': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
  'getter-return': 'error',
  'for-direction': 'error',
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
};

export default [
  { ignores: ['js/vendor/**', '_site/**', 'node_modules/**', 'godseye-tablet/**', 'tools/sim/shots/**', 'admin/**'] },
  { files: ['js/**/*.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: browser }, rules },
  { files: ['sw.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: Object.assign({ clients: 'readonly', skipWaiting: 'readonly' }, browser) }, rules },
  { files: ['tools/**/*.mjs', 'eslint.config.mjs'], languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: Object.assign({ process: 'readonly', Buffer: 'readonly' }, browser) }, rules },
];
