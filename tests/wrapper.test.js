const { describe, test, mock: nodeMock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const detector = require('../bunpm/core/detector');
const { main, spawnCommand, exitCode } = require('../bunpm/core/wrapper');
const {
  mapCommand,
  translateFlags,
  hasNonFlagArgs,
} = require('../bunpm/core/mapper');
const dirs = [];
const savedPath = process.env.PATH;
const isWin = process.platform === 'win32';
const binName = (name, cmd) =>
  isWin ? `${name}.${cmd ? 'cmd' : 'exe'}` : name;
const mock = (obj, key, impl) => nodeMock.method(obj, key, impl);
const fixture = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bunpm-test-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  nodeMock.restoreAll();
  if (savedPath === undefined) delete process.env.PATH;
  else process.env.PATH = savedPath;
  for (const d of dirs.splice(0))
    fs.rmSync(d, { recursive: true, force: true });
});

describe('wrapper entry and native execution', () => {
  test('routing preserves scripts and falls back instead of guessing semantics', () => {
    for (const tool of ['npm', 'yarn', 'pnpm']) {
      for (const cmd of [
        '--version',
        '-v',
        'version patch',
        'init -y',
        'ci',
        'exec tool',
        'constructor',
        '__proto__',
        'add pkg --unknown',
      ]) {
        const args = cmd.split(' ');
        assert.deepEqual(mapCommand(tool, args), {
          fallbackTo: tool,
          fallbackArgs: args,
        });
      }
      assert.deepEqual(
        mapCommand(tool, ['test', '--', '-D', '', '--filter=x']).bunArgs ?? [],
        tool === 'pnpm' ? [] : ['run', 'test', '-D', '', '--filter=x'],
      );
      assert.deepEqual(
        mapCommand(tool, ['run', 'build', '--', '-D', '']).bunArgs,
        ['run', 'build', '-D', ''],
      );
      assert.equal(mapCommand(tool, ['run', '--help']).fallbackTo, tool);
    }
    assert.equal(mapCommand('yarn', ['dev']).fallbackTo, 'yarn');
    assert.equal(
      mapCommand('yarn', ['global', 'remove', 'pkg']).fallbackTo,
      'yarn',
    );
    assert.deepEqual(mapCommand('yarn', ['global', 'add', 'pkg']).bunArgs, [
      'add',
      '-g',
      'pkg',
    ]);
    assert.deepEqual(
      mapCommand('npm', ['install', '--registry', 'https://example.test'])
        .bunArgs,
      ['install', '--registry', 'https://example.test'],
    );
    assert.equal(
      mapCommand('npm', ['install', '--registry']).fallbackTo,
      'npm',
    );
    assert.equal(mapCommand('npm', []).fallbackTo, 'npm');
    assert.deepEqual(mapCommand('pnpm', []).bunArgs, ['install']);
    assert.equal(mapCommand('npx', []).fallbackTo, 'npx');
    assert.equal(mapCommand('npx', ['--version']).fallbackTo, 'npx');
    assert.equal(mapCommand('yarn', ['dlx']).fallbackTo, 'yarn');
    assert.deepEqual(mapCommand('npm', ['add', '--', '-pkg']).bunArgs, [
      'add',
      '--',
      '-pkg',
    ]);
    assert.deepEqual(
      translateFlags(['--save', '--registry=x', '--', '-D', ''], {
        '--save': '',
        '--registry': '--registry',
        '-D': '-d',
      }),
      ['--registry=x', '--', '-D', ''],
    );
    assert.equal(hasNonFlagArgs(['--registry', 'x', 'pkg']), true);
    assert.deepEqual(mapCommand('npm', ['i']).bunArgs, ['install']);
    for (const args of [null, {}, [3], ['a\0b']])
      assert.throws(() => mapCommand('npm', args), /Arguments/);
  });

  test('native binary discovery skips wrapper roots, relative PATH and directories', () => {
    const root = fixture();
    const bin = path.join(root, 'bin');
    fs.mkdirSync(bin);
    const fake = path.join(bin, binName('yarn', true));
    fs.writeFileSync(fake, 'fixture', { mode: 0o755 });
    const other = path.join(root, '.bunpm', 'bin');
    fs.mkdirSync(other, { recursive: true });
    fs.writeFileSync(path.join(other, path.basename(fake)), 'wrapper', {
      mode: 0o755,
    });
    process.env.PATH = ['', '.', other, `"${bin}"`].join(path.delimiter);
    assert.equal(detector.locateBinary('pnpm'), null);
    assert.equal(detector.locateBinary('yarn'), fake);
    assert.throws(() => detector.locateBinary('bun & echo'), /Invalid binary/);
    process.env.PATH = '';
    assert.equal(detector.locateBinary('yarn', [bin, fake]), fake);
    assert.equal(
      detector.locateBinary('yarn', [path.join(root, 'missing')]),
      null,
    );
  });

  test('Bun detection prefers an absolute PATH entry', () => {
    const root = fixture();
    const bun = path.join(root, binName('bun', false));
    fs.writeFileSync(bun, 'fixture', { mode: 0o755 });
    process.env.PATH = root;
    assert.equal(detector.getBunPath(), bun);
  });

  test('Bun detection falls back to ~/.bun/bin when PATH has none', () => {
    const root = fixture();
    const bin = path.join(root, '.bun', 'bin');
    fs.mkdirSync(bin, { recursive: true });
    const bun = path.join(bin, binName('bun', false));
    fs.writeFileSync(bun, 'fixture', { mode: 0o755 });
    // os.homedir() reads HOME on Unix and USERPROFILE on Windows.
    const saved = {
      HOME: process.env.HOME,
      USERPROFILE: process.env.USERPROFILE,
    };
    process.env.HOME = root;
    process.env.USERPROFILE = root;
    process.env.PATH = '';
    try {
      assert.equal(detector.getBunPath(), bun);
    } finally {
      for (const [key, value] of Object.entries(saved))
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
  });

  test('diagnostics use one bunpm: <component>: <message> stderr convention', async () => {
    const lines = [];
    mock(console, 'error', (line) => lines.push(line));
    mock(detector, 'getBunPath', () => null);
    mock(detector, 'locateBinary', () => null);
    // A missing original manager must name the component and stay nonzero.
    assert.equal(await main('npm', ['install']), 1);
    // Unsupported invocations surface through the top-level wrapper handler.
    assert.equal(await main('bad', []), 1);
    // Pre-execution spawn failures keep the underlying cause text verbatim.
    assert.equal(exitCode({ error: new Error('spawn EPERM') }), 1);
    assert.deepEqual(lines, [
      'bunpm: detector: original npm not found; install npm for this command, or install Bun for supported commands.',
      'bunpm: wrapper: Expected one of: npm, npx, yarn, pnpm',
      'bunpm: exec: spawn EPERM',
    ]);
    for (const line of lines) assert.match(line, /^bunpm: [a-z]+: \S/);
  });

  test('the wrapper entry resolves main() to the process exit code', () => {
    const run = (/** @type {string} */ script, /** @type {string[]} */ args) =>
      cp.spawnSync(process.execPath, [script, ...args], {
        encoding: 'utf8',
        env: { ...process.env, PATH: '' },
      });
    const direct = run('bunpm/core/wrapper.js', ['bad']);
    assert.equal(direct.status, 1);
    assert.match(direct.stderr, /^bunpm: wrapper: Expected one of/);
  });

  test('native child argv preserves metacharacters and exact nonzero exit', () => {
    const args = [
      'space here',
      'a&b',
      '%PATH%',
      '"quoted"',
      '',
      'a|b',
      'line\nbreak',
    ];
    const result = spawnCommand(
      process.execPath,
      [
        '-e',
        'console.log(JSON.stringify(process.argv.slice(1))); process.exitCode=17',
        '--',
        ...args,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 17);
    assert.deepEqual(JSON.parse(result.stdout), args);
    assert.throws(() => spawnCommand('relative', []), /absolute/);
    assert.throws(() => spawnCommand(process.execPath, ['\0']));
  });

  test(
    'Windows batch fallback preserves safe args and rejects shell injection',
    { skip: process.platform !== 'win32' },
    () => {
      const root = fixture();
      const bin = path.join(root, 'Program Files (x86)');
      fs.mkdirSync(bin);
      const shim = path.join(bin, 'original.cmd');
      fs.writeFileSync(shim, '@echo off\r\necho %~1\r\nexit /b 19\r\n');
      const result = spawnCommand(shim, ['space here'], { encoding: 'utf8' });
      assert.equal(result.status, 19);
      assert.equal(result.stdout.trim(), 'space here');
      const wildcard = spawnCommand(shim, ['*'], { encoding: 'utf8' });
      assert.equal(wildcard.status, 19);
      assert.equal(wildcard.stdout.trim(), '*');
      const badArgs = [
        'x&echo pwn',
        '%PATH%',
        'a"b',
        '!VAR!',
        'a\nb',
        'a^b',
        '(x)',
      ];
      badArgs.forEach((a) =>
        assert.throws(() => spawnCommand(shim, [a]), /Unsafe batch/),
      );
      // Without SystemRoot/WINDIR there is no trustworthy cmd.exe to run.
      const savedRoots = {
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
      };
      delete process.env.SystemRoot;
      delete process.env.WINDIR;
      try {
        assert.throws(() => spawnCommand(shim, ['x']), /SystemRoot is not set/);
      } finally {
        for (const [key, value] of Object.entries(savedRoots))
          if (value !== undefined) process.env[key] = value;
      }
      const cli = path.join(root, 'node_modules', 'npm', 'bin');
      fs.mkdirSync(cli, { recursive: true });
      fs.writeFileSync(
        path.join(cli, 'npm-cli.js'),
        'console.log(JSON.stringify(process.argv.slice(2))); process.exitCode=11',
      );
      const direct = spawnCommand(
        path.join(root, 'npm.cmd'),
        ['a&b', '%PATH%'],
        {
          encoding: 'utf8',
        },
      );
      assert.equal(direct.status, 11);
      assert.deepEqual(JSON.parse(direct.stdout), ['a&b', '%PATH%']);
    },
  );
});
