import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { getMe, updateMe } from '../controllers/auth.controller.js';
import { updateMeSchema } from '../validators/auth.validators.js';

const router = Router();

// Register / login / reset / change password are handled by Supabase Auth on the client.
router.get('/me', authenticate, getMe);
router.patch('/me', authenticate, validate(updateMeSchema), updateMe);

export default router;
