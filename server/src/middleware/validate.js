import { AppError } from '../utils/AppError.js';

/** Validates { body, query, params } against a zod schema and replaces them with parsed values. */
export const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse({ body: req.body, query: req.query, params: req.params });
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    return next(new AppError('Validation failed', 400, details));
  }
  const { body, query, params } = result.data;
  if (body) req.body = body;
  if (query) Object.assign(req.query, query);
  if (params) Object.assign(req.params, params);
  next();
};
