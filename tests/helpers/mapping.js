const assert = require('node:assert/strict');
const { mapCommand } = require('../../bunpm/core/mapper');

/**
 * @param {string} tool
 * @param {[string[], string[]][]} cases
 */
function assertBunArgs(tool, cases) {
  for (const [args, expected] of cases)
    assert.deepEqual(
      mapCommand(tool, args).bunArgs,
      expected,
      `${tool} ${args.join(' ')}`,
    );
}

/**
 * @param {string} tool
 * @param {string[][]} cases
 */
function assertFallback(tool, cases) {
  for (const args of cases)
    assert.deepEqual(mapCommand(tool, args), {
      fallbackTo: tool,
      fallbackArgs: args,
    });
}

module.exports = { assertBunArgs, assertFallback };
