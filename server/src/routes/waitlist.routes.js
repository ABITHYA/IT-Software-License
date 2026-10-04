import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { uuid } from '../validators/common.js';
import * as c from '../controllers/waitlist.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', c.listWaitlist);
router.post(
  '/process/:softwareId',
  requireRole('it_admin'),
  validate(z.object({ params: z.object({ softwareId: uuid }) })),
  c.processNow
);

export default router;
