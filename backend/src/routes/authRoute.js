const { Router } = require('express');
const { requireAuth, requireAuthAllowPasswordChange, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const svc = require('../services/authService');
const reset = require('../services/passwordResetService');

const router = Router();

router.post('/auth/login', asyncHandler(svc.loginWithCredentials));
// Public: «¿Has olvidado tu contraseña?» (reset link by email, Phase 5)
router.post('/auth/forgotPassword', asyncHandler(reset.solicitar));
router.post('/auth/resetPassword', asyncHandler(reset.restablecer));
// These two stay reachable while must_change_password = 1; every other route is blocked.
router.get('/auth/me', requireAuthAllowPasswordChange, asyncHandler(svc.getMe));
router.post('/auth/changePassword', requireAuthAllowPasswordChange, asyncHandler(svc.changePassword));

// Admin: user management
// SEC-11: the full user list is for administrators only (no screen uses it).
router.get('/usuarios', requireAuth, requireRole('ADMINISTRADOR'), asyncHandler(svc.getAll));
router.post('/usuarios/:id/resetPassword', requireAuth, requireRole('ADMINISTRADOR'), asyncHandler(svc.resetPassword));

module.exports = router;
