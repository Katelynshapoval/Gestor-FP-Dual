const { Router } = require('express');
const { requireAuth, requireAuthAllowPasswordChange, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const svc = require('../services/authService');
const personal = require('../services/personalService');
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
// Staff accounts. Registered before /usuarios/:id so "personal" is never an id.
router.get('/usuarios/personal', requireAuth, requireRole('ADMINISTRADOR'), asyncHandler(personal.list));
router.post('/usuarios/personal', requireAuth, requireRole('ADMINISTRADOR'), asyncHandler(personal.create));
router.patch('/usuarios/personal/:id', requireAuth, requireRole('ADMINISTRADOR'), asyncHandler(personal.update));
router.post('/usuarios/personal/:id/baja', requireAuth, requireRole('ADMINISTRADOR'), asyncHandler(personal.baja));
router.post('/usuarios/personal/:id/reactivar', requireAuth, requireRole('ADMINISTRADOR'), asyncHandler(personal.reactivar));
router.post('/usuarios/:id/resetPassword', requireAuth, requireRole('ADMINISTRADOR'), asyncHandler(svc.resetPassword));

module.exports = router;
