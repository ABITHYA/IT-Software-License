import { AppError } from './AppError.js';

/** Converts a Supabase/Postgres error into a clean AppError. No-op when error is null. */
export const throwIfError = (error, message = 'Database error') => {
  if (!error) return;
  if (error.code === '23505') throw new AppError('A record with the same unique value already exists', 409);
  if (error.code === '23503') throw new AppError('Invalid reference, or the record is still in use', 409);
  if (['22P02', '23514', '23502'].includes(error.code)) {
    throw new AppError(`Invalid data: ${error.message}`, 400);
  }
  console.error(message, error);
  throw new AppError(message, 500);
};
