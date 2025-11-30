/**
 * catchAsync Utility
 * 
 * Wraps async route handlers to automatically catch errors and pass them
 * to Express's error handling middleware. This eliminates the need for
 * try-catch blocks in every async route handler.
 * 
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped function that catches errors
 * 
 * @example
 * // Instead of:
 * router.get('/users', async (req, res, next) => {
 *   try {
 *     const users = await User.find();
 *     res.json(users);
 *   } catch (error) {
 *     next(error);
 *   }
 * });
 * 
 * // You can write:
 * router.get('/users', catchAsync(async (req, res, next) => {
 *   const users = await User.find();
 *   res.json(users);
 * }));
 */
const catchAsync = (fn) => (req, res, next) => fn(req, res, next).catch(next);

export default catchAsync;

