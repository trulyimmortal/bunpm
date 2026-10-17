const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { formatStream, formatOutput } = require('../bunpm/core/formatter');

describe('stream formatting and bounded buffering', () => {
  /**
   * @param {Buffer[]} chunks
   * @param {{ invokedAs: string, subcommand: string }} context
   */
  function streamed(chunks, context) {
    const source = new EventEmitter();
    /** @type {string[]} */
    const writes = [];
    formatStream(source, (text) => writes.push(text), context);
    for (const chunk of chunks) source.emit('data', chunk);
    source.emit('end');
    return writes;
  }

  test('formatStream writes formatted lines and keeps split characters intact', () => {
    const npm = { invokedAs: 'npm', subcommand: 'install' };
    const check = Buffer.from('✓\n');
    assert.deepEqual(
      streamed(
        [
          Buffer.from('bun install v1.3.14\n  2 packa'),
          Buffer.from('ges installed [1ms]\n'),
          check.subarray(0, 2),
          check.subarray(2),
        ],
        npm,
      ),
      ['added 2 packages in 1ms\n', '✓\n'],
    );
    // Multi-line replacements are written whole; an unterminated tail on 'end'.
    assert.deepEqual(
      streamed([Buffer.from('installed a@1\nDone in 5ms')], {
        invokedAs: 'yarn',
        subcommand: 'add',
      }),
      [
        'success Saved 1 new dependency.\ninfo Direct dependencies\n└─ a@1\n',
        'Done in 5ms.',
      ],
    );
    assert.deepEqual(streamed([], npm), []);
    // The one allowed difference from formatOutput: a dropped final fragment.
    assert.deepEqual(streamed([Buffer.from('x\nbun add v1.3.14')], npm), [
      'x\n',
    ]);
  });

  test('oversized lines stream unchanged before EOF and resume formatting after newline', () => {
    const context = { invokedAs: 'npm', subcommand: 'install' };
    const prefix = 'installed ' + 'x'.repeat(65536 - 'installed '.length);
    const emoji = Buffer.from('🎉');
    for (const ending of ['', '\ninstalled ok@1\n']) {
      const source = new EventEmitter();
      const writes = [];
      formatStream(source, (text) => writes.push(text), context);
      source.emit('data', Buffer.from(prefix));
      source.emit('data', emoji.subarray(0, 2));
      assert.deepEqual(writes, []);
      source.emit('data', emoji.subarray(2));
      assert.equal(writes.join(''), prefix + '🎉');
      source.emit('data', Buffer.from('installed tail@1'));
      assert.equal(writes.join(''), prefix + '🎉installed tail@1');
      source.emit('data', Buffer.from(ending));
      source.emit('data', Buffer.from([0xe2]));
      source.emit('end');
      const expected =
        prefix +
        '🎉installed tail@1' +
        ending.replace('installed', 'added') +
        '�';
      assert.equal(writes.join(''), expected);
    }
    assert.equal(
      streamed([Buffer.from(prefix + 'x\ninstalled ok@1')], context).join(''),
      prefix + 'x\nadded ok@1',
    );
    assert.equal(
      streamed([Buffer.from(prefix)], context).join(''),
      prefix.replace('installed', 'added'),
    );
  });

  test('formatStream equals formatOutput for any chunking (seeded)', () => {
    // mulberry32: a deterministic generator, so failures are reproducible.
    let seed = 0xb0b;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    /** @param {string[]} items */
    const pick = (items) => items[Math.floor(rand() * items.length)];
    const corpus = [
      'bun add v1.3.14 (abc)',
      'installed lodash@4.17.21',
      '  2 packages installed [1.00ms]',
      'Done in 12ms',
      'error: boom ✗',
      'Checked 1 install across 2 packages (no changes) [1ms]',
      '$ echo hi',
      '',
      'héllo 日本語 🎉',
      'crlf\r',
    ];
    for (let i = 0; i < 200; i++) {
      const context = {
        invokedAs: pick(['npm', 'yarn', 'pnpm']),
        subcommand: pick(['install', 'add', 'run']),
      };
      const lines = Array.from({ length: 1 + Math.floor(rand() * 6) }, () =>
        pick(corpus),
      );
      const text = lines.join('\n') + '\n';
      const bytes = Buffer.from(text);
      /** @type {number[]} */
      const cuts = [];
      for (let at = 1; at < bytes.length; at++) if (rand() < 0.3) cuts.push(at);
      const chunks = [0, ...cuts].map((start, n) =>
        bytes.subarray(start, cuts[n] ?? bytes.length),
      );
      assert.equal(
        streamed(chunks, context).join(''),
        formatOutput(text, context),
        `i ${i} cuts ${cuts.join(',')}`,
      );
      const everyByte = [...bytes].map((byte) => Buffer.from([byte]));
      assert.equal(
        streamed(everyByte, context).join(''),
        formatOutput(text, context),
      );
    }
  });
});
