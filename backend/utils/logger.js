const LOG_LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

let idCounter = 0;

function generateId() {
  return `${Date.now().toString(36)}-${(++idCounter).toString(36)}`;
}

function log(level, context, message, data = {}) {
  if (LOG_LEVELS[level] > currentLevel) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    context,
    message,
    ...data
  };

  const output = JSON.stringify(entry);

  if (level === 'ERROR') {
    console.error(output);
  } else if (level === 'WARN') {
    console.warn(output);
  } else {
    console.log(output);
  }
}

module.exports = { log, generateId, LOG_LEVELS };
