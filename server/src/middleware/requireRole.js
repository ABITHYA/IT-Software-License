import { AppError } from '../utils/AppError.js';

/** Usage: router.post('/', authenticate, requireRole('it_admin'), handler)
 *  super_admin always passes. */
export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(new AppError('Authentication required', 401));
    if (req.user.role === 'super_admin' || roles.includes(req.user.role)) return next();
    next(new AppError('You do not have permission to perform this action', 403));
  };
