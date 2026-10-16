const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'),
);
const runtime = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../bunpm/package.json'), 'utf8'),
);

// A stable release must identify the exact version shipped by both manifests.
assert.match(process.env.RELEASE_TAG || '', /^v\d+\.\d+\.\d+$/);
assert.equal(process.env.RELEASE_TAG, `v${pkg.version}`);
assert.equal(runtime.version, pkg.version);
