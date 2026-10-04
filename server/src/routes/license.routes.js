import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../validators/common.js';
import * as v from '../validators/license.validators.js';
import * as c from '../controllers/license.controller.js';

const router = Router();
router.use(authenticate);
const admin = requireRole('it_admin');

// Any logged-in user
router.get('/mine', c.myLicenses);
router.post('/:id/activity', validate(idParams), c.recordActivity);

// IT admin
router.get('/', admin, validate(v.listLicensesSchema), c.listLicenses);
router.post('/', admin, validate(v.createLicenseSchema), c.createLicense);
router.post('/bulk', admin, validate(v.bulkLicenseSchema), c.bulkCreateLicenses);
router.get('/:id', admin, validate(idParams), c.getLicense);
router.patch('/:id/status', admin, validate(v.licenseStatusSchema), c.updateLicenseStatus);
router.patch('/:id/assign', admin, validate(v.assignLicenseSchema), c.assignLicense);
router.patch('/:id/revoke', admin, validate(v.revokeLicenseSchema), c.revoke);

export default router;
