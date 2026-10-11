// bunpm's one diagnostic channel. Every failure is a human line on stderr,
// `bunpm: <component>: <message>`, so users can tell bunpm's output from the
// child manager's. With BUNPM_DEBUG=1 the same failure is also one JSON line,
// for CI pipelines and tools that embed bunpm.

/**
 * @typedef {object} DiagnosticRecord
 * @property {string} timestamp ISO 8601 UTC timestamp
 * @property {'error'} level diagnostic severity level
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
 * @returns {DiagnosticRecord}
 */
function formatDiagnostic(component, message, code) {
  return {
    timestamp: new Date().toISOString(),
    level: 'error',
    component,
    message,
    ...(code && { code }),
  };
}

/**
 * @param {string} component failing part: wrapper, exec, detector, doctor, ...
 * @param {string} message actionable text, cause preserved verbatim
 * @param {string} [code] error code such as ENOENT, when known
 */
function log(component, message, code) {
  console.error(`bunpm: ${component}: ${message}`);
  if (process.env.BUNPM_DEBUG === '1')
    console.error(JSON.stringify(formatDiagnostic(component, message, code)));
}

module.exports = { log, formatDiagnostic };
