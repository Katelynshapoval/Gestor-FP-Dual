const { Router } = require('express');
const { requireAuth, requireAuthAllowPasswordChange, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const svc = require('../services/authService');

const router = Router();

router.post('/auth/login', asyncHandler(svc.loginWithCredentials));
// These two stay reachable while must_change_password = 1; every other route is blocked.
router.get('/auth/me', requireAuthAllowPasswordChange, asyncHandler(svc.getMe));
router.post('/auth/changePassword', requireAuthAllowPasswordChange, asyncHandler(svc.changePassword));

// Admin: user management
router.get('/usuarios', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.getAll));
router.post('/usuarios/:id/resetPassword', requireAuth, requireRole('ADMINISTRADOR'), asyncHandler(svc.resetPassword));

module.exports = router;
