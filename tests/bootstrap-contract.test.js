const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { validateUrl, filesFor, detectPlatform } = require('../bunpm/bootstrap');
const { locateBinary } = require('../bunpm/core/detector');

describe('bootstrap manifest and entry contracts', () => {
  const sha = 'a'.repeat(40);
  const base = `https://raw.githubusercontent.com/yv3000/bunpm/${sha}/bunpm/`;
  test('bootstrap validates platform, manifest and URL trust boundary', () => {
    for (const [native, platform] of [
      ['win32', 'windows'],
      ['darwin', 'macos'],
      ['linux', 'linux'],
    ]) {
      assert.equal(detectPlatform(native), platform);
      assert.ok(filesFor(platform).includes('core/wrapper.js'));
      assert.equal(
        filesFor(platform)
          .filter((file) => file.startsWith('platforms/'))
          .every((file) => file.startsWith(`platforms/${platform}/`)),
        true,
      );
    }
    assert.throws(() => detectPlatform('aix'));
    assert.throws(() => filesFor('other'));
    assert.equal(validateUrl(base + 'core/wrapper.js').protocol, 'https:');
    for (const [url, rule] of [
      ['file:///tmp/x', /HTTPS is required/],
      ['http://raw.githubusercontent.com/x', /HTTPS is required/],
      [base.replace('raw.githubusercontent.com', 'evil.test'), /host must be/],
      [base.replace('.com/', '.com:444/'), /host must be/],
      [base + 'x?token=x', /query and fragment/],
      [base + 'x#hash', /query and fragment/],
      [base.replace('https://', 'https://user:pass@'), /credentials/],
      [base.replace(sha, 'main'), /40-hex commit SHA/],
      [base.replace(sha, sha.slice(1)), /40-hex commit SHA/],
      [
        base.replace(sha, sha.toUpperCase().replace(/A/g, 'F')),
        /40-hex commit SHA/,
      ],
      [base.replace('/yv3000/', '/someone/'), /40-hex commit SHA/],
      [
        base.replace('/bunpm/' + sha, '/bunpm-fork/' + sha),
        /40-hex commit SHA/,
      ],
      // URL parsing resolves '..', so traversal leaves the bunpm/ directory.
      [base + '../package.json', /40-hex commit SHA/],
    ])
      assert.throws(() => validateUrl(url), {
        name: 'TypeError',
        message: new RegExp('^Unsafe download URL: .*' + rule.source),
      });
  });

  test('bootstrap manifest lists exactly the runtime files in the checkout', () => {
    const core = fs
      .readdirSync('bunpm/core')
      .filter((file) => file.endsWith('.js'));
    for (const platform of ['windows', 'macos', 'linux']) {
      const files = filesFor(platform);
      for (const file of files)
        assert.ok(fs.existsSync(path.join('bunpm', file)), file);
      for (const file of core) assert.ok(files.includes(`core/${file}`), file);
    }
  });

  test('bootstrap CLI reports usage with the shared diagnostic prefix', () => {
    // Run the documented `node bootstrap.js` entrypoint, the production invocation.
    const node = locateBinary('node');
    assert.notEqual(node, null);
    // Argument validation fails before any request, so this stays offline.
    const result = cp.spawnSync(node, [path.resolve('bunpm/bootstrap.js')], {
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(
      result.stderr.trim(),
      'bunpm: bootstrap: Usage: node bootstrap.js --revision <40-character commit SHA>',
    );
  });
});
