import { Router } from 'express';
import authRoutes from './auth.routes.js';
import departmentRoutes from './department.routes.js';
import softwareRoutes from './software.routes.js';
import policyRoutes from './policy.routes.js';
import licenseRoutes from './license.routes.js';
import requestRoutes from './request.routes.js';
import waitlistRoutes from './waitlist.routes.js';

const router = Router();

router.get('/health', (_req, res) =>
  res.json({ success: true, status: 'ok', time: new Date().toISOString() })
);

router.use('/auth', authRoutes);
router.use('/departments', departmentRoutes);
router.use('/software', softwareRoutes);
router.use('/policies', policyRoutes);
router.use('/licenses', licenseRoutes);
router.use('/requests', requestRoutes);
router.use('/waitlist', waitlistRoutes);
// Next batch: /users, /notifications, /audit-logs, /dashboard, /packages, /reports

export default router;
