import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import * as c from '../controllers/user.controller.js';

const router = Router();

// Middleware: User must be logged in AND be an IT Admin or Super Admin
const admin = [authenticate, requireRole('it_admin', 'super_admin')];

// Deactivate a user (Triggers the offboarding cascade)
router.patch('/:id/deactivate', admin, c.deactivateUser);

export default router;