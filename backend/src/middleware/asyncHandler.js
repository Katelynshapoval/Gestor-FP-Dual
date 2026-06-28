// Wraps an async route handler so that promise rejections are forwarded to
// Express's next() error handler rather than causing an unhandled rejection.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
