// Resolves the `common/*` path alias at runtime for the compiled output.
// In production we run `node dist/src/main.js` directly, so the Nest CLI's
// automatic tsconfig-paths handling is not available — we register it here.
const path = require('path');
const { register } = require('tsconfig-paths');

register({
  baseUrl: path.join(__dirname, 'dist'),
  paths: {
    'common/*': ['common/*'],
  },
});
