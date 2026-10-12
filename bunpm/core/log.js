// bunpm's one diagnostic channel. Every failure is a human line on stderr,
// `bunpm: <component>: <message>`, so users can tell bunpm's output from the
// child manager's. With BUNPM_DEBUG=1 the same failure is also one JSON line,
// for CI pipelines and tools that embed bunpm.

/**
 * @typedef {'error' | 'warn' | 'info' | 'debug'} LogLevel
 * @typedef {object} DiagnosticRecord
 * @property {string} timestamp ISO 8601 UTC timestamp
 * @property {LogLevel} level diagnostic severity level
 * @property {string} component failing part: wrapper, exec, detector, doctor, ...
 * @property {string} message actionable text, cause preserved verbatim
 * @property {string} [code] error code such as ENOENT, when known
 */

/**
 * Create a structured diagnostic record matching the schema.
 *
 * @param {string} component
 * @param {string} message
 * @param {string} [code]
 * @param {LogLevel} [level]
 * @returns {DiagnosticRecord}
 */
function formatDiagnostic(component, message, code, level = 'error') {
  return {
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
    ...(code && { code }),
  };
}

/**
 * Emit human message to stderr and structured JSON when BUNPM_DEBUG=1.
 *
 * @param {string} component failing part: wrapper, exec, detector, doctor, ...
 * @param {string} message actionable text, cause preserved verbatim
 * @param {string} [code] error code such as ENOENT, when known
 * @param {LogLevel} [level]
 */
function log(component, message, code, level = 'error') {
  console.error(`bunpm: ${component}: ${message}`);
  if (process.env.BUNPM_DEBUG === '1')
    console.error(
      JSON.stringify(formatDiagnostic(component, message, code, level)),
    );
}

/**
 * Structured logger methods for multi-level diagnostics.
 */
const logger = Object.freeze({
  /** @param {string} component @param {string} message @param {string} [code] */
  error: (component, message, code) => log(component, message, code, 'error'),
  /** @param {string} component @param {string} message @param {string} [code] */
  warn: (component, message, code) => log(component, message, code, 'warn'),
  /** @param {string} component @param {string} message @param {string} [code] */
  info: (component, message, code) => log(component, message, code, 'info'),
  /** @param {string} component @param {string} message @param {string} [code] */
  debug: (component, message, code) => log(component, message, code, 'debug'),
});

module.exports = { log, logger, formatDiagnostic };
