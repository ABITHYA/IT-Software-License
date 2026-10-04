import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../validators/common.js';
import * as v from '../validators/software.validators.js';
import * as c from '../controllers/software.controller.js';

const router = Router();
router.use(authenticate);
const admin = requireRole('it_admin');

// Everyone logged in can browse the catalog (cost is hidden from employees)
router.get('/', validate(v.listSoftwareSchema), c.listSoftware);
router.get('/meta/categories', c.listCategories);
router.post('/risk-preview', admin, validate(v.riskPreviewSchema), c.riskPreview);
router.get('/:id', validate(idParams), c.getSoftware);

router.post('/', admin, validate(v.createSoftwareSchema), c.createSoftware);
router.put('/:id', admin, validate(v.updateSoftwareSchema), c.updateSoftware);
router.delete('/:id', admin, validate(idParams), c.deactivateSoftware);

router.post('/:id/access-levels', admin, validate(v.accessLevelSchema), c.addAccessLevel);
router.delete('/:id/access-levels/:levelId', admin, validate(v.removeAccessLevelSchema), c.removeAccessLevel);
router.put('/:id/departments', admin, validate(v.setDepartmentsSchema), c.setDepartments);

export default router;
