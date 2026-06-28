const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const svc = require('../services/authService');

const router = Router();

router.post('/auth/login', asyncHandler(svc.loginWithCredentials));
router.get('/auth/me', requireAuth, asyncHandler(svc.getMe));
router.post('/auth/changePassword', requireAuth, asyncHandler(svc.changePassword));

// Admin: user management
router.get('/usuarios', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.getAll));
router.post('/usuarios/:id/resetPassword', requireAuth, requireRole('ADMINISTRADOR'), asyncHandler(svc.resetPassword));

module.exports = router;
