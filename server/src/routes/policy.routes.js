import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { policyUpdateSchema } from '../validators/software.validators.js';
import * as c from '../controllers/policy.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', requireRole('it_admin', 'security_admin'), c.listPolicies);
router.put('/:risk', requireRole(), validate(policyUpdateSchema), c.updatePolicy); // super_admin only

export default router;
