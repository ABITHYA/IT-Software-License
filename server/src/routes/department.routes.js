import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../validators/common.js';
import { createDepartmentSchema, updateDepartmentSchema } from '../validators/department.validators.js';
import * as c from '../controllers/department.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', c.listDepartments);
router.post('/', requireRole('it_admin'), validate(createDepartmentSchema), c.createDepartment);
router.put('/:id', requireRole('it_admin'), validate(updateDepartmentSchema), c.updateDepartment);
router.delete('/:id', requireRole('it_admin'), validate(idParams), c.deleteDepartment);

export default router;
