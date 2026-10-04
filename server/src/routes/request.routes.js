import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../validators/common.js';
import * as v from '../validators/request.validators.js';
import * as c from '../controllers/request.controller.js';

const router = Router();
router.use(authenticate);

router.post('/', validate(v.createRequestSchema), c.create);
router.get('/', validate(v.listRequestsSchema), c.list);
router.get('/pending-approvals', requireRole('manager', 'it_admin', 'security_admin'), c.pending);

router.get('/:id', validate(idParams), c.getOne);
router.patch('/:id/approve', requireRole('manager', 'it_admin', 'security_admin'), validate(v.approveSchema), c.approve);
router.patch('/:id/reject', requireRole('manager', 'it_admin', 'security_admin'), validate(v.rejectSchema), c.reject);
router.patch('/:id/cancel', validate(idParams), c.cancel);
router.post('/:id/assign', requireRole('it_admin'), validate(idParams), c.assign);

export default router;
