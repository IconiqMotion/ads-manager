const { log } = require('../utils/logger');

function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'An unexpected error occurred';

  log('ERROR', 'http', 'Unhandled error', {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    status,
    code,
    error: message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
  });

  res.status(status).json({
    error: {
      code,
      message: process.env.NODE_ENV === 'production' && status === 500
        ? 'Internal server error'
        : message,
      ...(err.details ? { details: err.details } : {})
    }
  });
}

module.exports = errorHandler;
