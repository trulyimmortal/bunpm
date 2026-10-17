// Installer PATH editing and prerequisite checks, run natively per OS.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');

describe('Unix installer profile safety', () => {
  test(
    'Unix installer preserves the profile and rolls back when grep cannot read it',
    { skip: process.platform === 'win32', timeout: 30000 },
    () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bunpm-profile-'));
      try {
        const home = path.join(root, 'home');
        const tools = path.join(root, 'tools');
        fs.mkdirSync(home);
        fs.mkdirSync(tools);
        const platform = process.platform === 'darwin' ? 'macos' : 'linux';
        const profile = path.join(
          home,
          platform === 'macos' ? '.zprofile' : '.bashrc',
        );
        const content = 'export KEEP=unchanged';
        fs.writeFileSync(profile, content);
        for (const tool of ['node', 'bun'])
          fs.writeFileSync(path.join(tools, tool), '#!/bin/sh\nexit 0\n', {
            mode: 0o755,
          });
        fs.writeFileSync(
          path.join(tools, 'grep'),
          '#!/bin/sh\necho "profile read failed" >&2\nexit 2\n',
          { mode: 0o755 },
        );
        const result = cp.spawnSync(
          'bash',
          [path.resolve(`bunpm/platforms/${platform}/scripts/install.sh`)],
          {
            cwd: root,
            env: {
              ...process.env,
              HOME: home,
              PATH: `${tools}:${process.env.PATH}`,
            },
            encoding: 'utf8',
            timeout: 15000,
          },
        );
        assert.equal(result.status, 2, result.stderr);
        assert.match(result.stderr, /profile read failed/);
        assert.equal(fs.readFileSync(profile, 'utf8'), content);
        assert.equal(fs.existsSync(path.join(home, '.bunpm')), false);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
