import { z } from 'zod';
import { idParam } from './common.js';

const body = z.object({ name: z.string().trim().min(2).max(60) });
export const createDepartmentSchema = z.object({ body });
export const updateDepartmentSchema = z.object({ params: idParam, body });
