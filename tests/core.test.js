const { describe, test, mock: nodeMock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { setImmediate } = require('node:timers');
const detector = require('../bunpm/core/detector');
const {
  mapCommand,
  translateFlags,
  hasNonFlagArgs,
} = require('../bunpm/core/mapper');
const { main, exitCode } = require('../bunpm/core/wrapper');

const dirs = [];
const savedPath = process.env.PATH;
function mock(object, key, implementation) {
  return nodeMock.method(object, key, implementation);
}

afterEach(() => {
  nodeMock.restoreAll();
  if (savedPath === undefined) delete process.env.PATH;
  else process.env.PATH = savedPath;
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe('core command mapping', () => {
  test('maps common dependency operations without mutating input', () => {
    for (const [tool, args, expected] of [
      ['npm', ['install'], ['install']],
      ['npm', ['i', '-D', 'typescript'], ['add', '-d', 'typescript']],
      ['npm', ['remove', 'old'], ['remove', 'old']],
      ['yarn', [], ['install']],
      ['yarn', ['add', '--dev', 'typescript'], ['add', '-d', 'typescript']],
      ['pnpm', ['add', 'pkg'], ['add', 'pkg']],
      ['pnpm', ['why', 'pkg'], ['pm', 'why', 'pkg']],
    ]) {
      const original = [...args];
      assert.deepEqual(mapCommand(tool, args).bunArgs, expected);
      assert.deepEqual(args, original);
    }
  });

  test('unsupported and workspace commands preserve original arguments', () => {
    for (const tool of ['npm', 'yarn', 'pnpm']) {
      assert.deepEqual(mapCommand(tool, ['publish', '--tag', 'next']), {
        fallbackTo: tool,
        fallbackArgs: ['publish', '--tag', 'next'],
      });
    }
    for (const flag of ['-r', '--recursive', '--filter=app']) {
      assert.equal(mapCommand('pnpm', ['install', flag]).fallbackTo, 'pnpm');
    }
    assert.throws(() => mapCommand('other', []));
  });

  test('package execution passes arguments without translating script flags', () => {
    for (const [tool, args] of [
      ['npx', ['pkg', '--dev']],
      ['yarn', ['dlx', 'pkg', '--dev']],
      ['pnpm', ['dlx', 'pkg', '--dev']],
    ]) {
      assert.deepEqual(mapCommand(tool, args), {
        useBunx: true,
        bunArgs: ['pkg', '--dev'],
        fallbackTo: null,
      });
    }
    assert.deepEqual(
      translateFlags(['--registry=https://example.com', '--dev', 'pkg'], {
        '--dev': '-d',
      }),
      ['--registry=https://example.com', '-d', 'pkg'],
    );
  });

  test('npm options after a script name stay with npm, not the script', () => {
    for (const args of [
      ['test', '--watch'],
      ['start', '--port=3000'],
      ['run', 'build', '--if-present'],
      ['run', 'build', 'src', '--silent', '--', 'x'],
    ]) {
      assert.deepEqual(mapCommand('npm', args), {
        fallbackTo: 'npm',
        fallbackArgs: args,
      });
    }
    assert.deepEqual(mapCommand('npm', ['run', 'build', 'src']).bunArgs, [
      'run',
      'build',
      'src',
    ]);
    assert.deepEqual(mapCommand('npm', ['test', '--', '--watch']).bunArgs, [
      'run',
      'test',
      '--watch',
    ]);
    for (const tool of ['yarn', 'pnpm'])
      assert.deepEqual(mapCommand(tool, ['run', 'build', '--prod']).bunArgs, [
        'run',
        'build',
        '--prod',
      ]);
  });

  test('translateFlags and hasNonFlagArgs correctly evaluate flag boundaries', () => {
    assert.equal(hasNonFlagArgs([]), false);
    assert.equal(hasNonFlagArgs(['-v', '--save-dev']), false);
    assert.equal(hasNonFlagArgs(['--registry', 'https://example.com']), false);
    assert.equal(
      hasNonFlagArgs(['--registry', 'https://example.com', 'react']),
      true,
    );
    assert.equal(hasNonFlagArgs(['pkg']), true);
    assert.deepEqual(
      translateFlags(['--save', '--registry=x', '--', '-D', ''], {
        '--save': '',
        '--registry': '--registry',
        '-D': '-d',
      }),
      ['--registry=x', '--', '-D', ''],
    );
  });

  test('exitCode resolves numeric status and standard POSIX signals', () => {
    assert.equal(exitCode({ status: 0 }), 0);
    assert.equal(exitCode({ status: 42 }), 42);
    assert.equal(exitCode({ status: null, signal: 'SIGHUP' }), 129);
    assert.equal(exitCode({ status: null, signal: 'SIGINT' }), 130);
    assert.equal(exitCode({ status: null, signal: 'SIGKILL' }), 137);
    assert.equal(exitCode({ status: null, signal: 'SIGTERM' }), 143);
    assert.equal(exitCode({ status: null, signal: 'unknown' }), 129);
    assert.equal(exitCode({ status: null }), 1);
  });

  test('Yarn PnP roots and nested workspaces preserve native argv without finding Bun', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bunpm-pnp-'));
    dirs.push(dir);
    const savedCwd = process.cwd();
    try {
      const nested = path.join(dir, 'packages', 'app');
      fs.mkdirSync(nested, { recursive: true });
      const bun = mock(detector, 'getBunPath', () => process.execPath);
      const original = mock(detector, 'locateBinary', () => process.execPath);
      const sync = mock(cp, 'spawnSync', () => ({ status: 42 }));
      const args = ['add', '--dev', 'example'];
      for (const marker of ['.pnp.cjs', '.pnp.js']) {
        fs.writeFileSync(path.join(dir, marker), '');
        for (const cwd of [dir, nested]) {
          process.chdir(cwd);
          assert.equal(await main('yarn', args), 42);
        }
        fs.unlinkSync(path.join(dir, marker));
      }
      assert.equal(bun.mock.callCount(), 0);
      assert.equal(sync.mock.callCount(), 4);
      for (const call of sync.mock.calls)
        assert.deepEqual(call.arguments[1], args);
      for (const call of original.mock.calls)
        assert.deepEqual(call.arguments, ['yarn']);
      assert.equal(await main('yarn', ['run', 'build']), 42);
      assert.equal(bun.mock.callCount(), 1);
      assert.equal(original.mock.callCount(), 4);
      assert.deepEqual(sync.mock.calls[4].arguments[1], ['run', 'build']);
    } finally {
      process.chdir(savedCwd);
    }
  });

  test('pipe errors wait for close, fail without retry and remove listeners', async () => {
    const logs = mock(console, 'error', () => {});
    mock(detector, 'getBunPath', () => process.execPath);
    const original = mock(detector, 'locateBinary', () => process.execPath);
    let child;
    mock(cp, 'spawn', () => child);
    for (const stream of ['stdout', 'stderr']) {
      child = Object.assign(new EventEmitter(), {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
      });
      const before = ['SIGINT', 'SIGTERM'].map((s) => process.listenerCount(s));
      let settled = false;
      const pending = main('npm', ['install']).then((code) => {
        settled = true;
        return code;
      });
      child.emit('spawn');
      child[stream].emit(
        'error',
        Object.assign(new Error('pipe failed'), { code: 'EACCES' }),
      );
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(settled, false);
      child.stdout.end();
      child.stderr.end();
      child.emit('close', 0, null);
      assert.equal(await pending, 1);
      assert.equal(child[stream].listenerCount('error'), 0);
      assert.deepEqual(
        ['SIGINT', 'SIGTERM'].map((s) => process.listenerCount(s)),
        before,
      );
    }
    assert.equal(original.mock.callCount(), 0);
    assert.equal(logs.mock.callCount(), 2);
    assert.match(logs.mock.calls[0].arguments[0], /pipe failed/);
  });
});
