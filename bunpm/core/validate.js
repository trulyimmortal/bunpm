// Input validation and trust-boundary guards for bunpm.
// Provides schema patterns and named guard functions for CLI inputs,
// binaries, and network URLs.

const path = require('node:path');

/** @type {readonly ['npm', 'npx', 'yarn', 'pnpm']} */
const VALID_MANAGERS = Object.freeze(['npm', 'npx', 'yarn', 'pnpm']);

/**
 * Recognized validation patterns for static analysis and runtime audits.
 */
const INPUT_VALIDATION_PATTERNS = Object.freeze({
  manager: /^(npm|npx|yarn|pnpm)$/,
  safeString: /^[^\0]*$/,
  commitSha: /^[a-f0-9]{40}$/,
  githubPath: /^\/yv3000\/bunpm\/[a-f0-9]{40}\/bunpm\//,
  githubUrl:
    /^https:\/\/raw\.githubusercontent\.com\/yv3000\/bunpm\/[a-f0-9]{40}\/bunpm\//,
});

/**
 * Validates that an arguments value is an array of strings without NUL bytes.
 *
 * @param {unknown} args
 */
function validateArgs(args) {
  if (
    !Array.isArray(args) ||
    args.some((arg) => typeof arg !== 'string' || arg.includes('\0'))
  ) {
    throw new TypeError(
      'Arguments must be an array of strings without NUL bytes',
    );
  }
}

/**
 * Validates that the invoked package manager name is recognized.
 *
 * @param {unknown} invokedAs
 */
function validateManager(invokedAs) {
  if (
    typeof invokedAs !== 'string' ||
    !VALID_MANAGERS.includes(/** @type {any} */ (invokedAs))
  ) {
    throw new TypeError('Expected one of: npm, npx, yarn, pnpm');
  }
}

/**
 * Validates that an executable binary path is a non-empty, absolute path string
 * free of NUL bytes.
 *
 * @param {unknown} binary
 */
function validateBinary(binary) {
  if (
    typeof binary !== 'string' ||
    !binary ||
    !path.isAbsolute(binary) ||
    binary.includes('\0')
  ) {
    throw new TypeError('Expected an absolute executable path');
  }
}

/**
 * Validates a remote download URL against strict origin, path, and protocol
 * rules. Rejects query strings, fragments, credentials, and non-HTTPS protocols.
 *
 * @param {string | URL} value
 * @returns {URL}
 */
function validateUrl(value) {
  const url = new URL(value);
  /** @type {[string, boolean][]} */
  const rules = [
    ['HTTPS is required', url.protocol === 'https:'],
    [
      'host must be raw.githubusercontent.com on the default port',
      url.hostname === 'raw.githubusercontent.com' && !url.port,
    ],
    [
      'credentials, query and fragment are not allowed',
      !url.username && !url.password && !url.search && !url.hash,
    ],
    [
      'path must be /yv3000/bunpm/<40-hex commit SHA>/bunpm/',
      INPUT_VALIDATION_PATTERNS.githubPath.test(url.pathname),
    ],
  ];
  const broken = rules.find(([, ok]) => !ok);
  if (broken) throw new Error(`Unsafe download URL: ${broken[0]}`);
  return url;
}

module.exports = {
  VALID_MANAGERS,
  INPUT_VALIDATION_PATTERNS,
  validateArgs,
  validateManager,
  validateBinary,
  validateUrl,
};
