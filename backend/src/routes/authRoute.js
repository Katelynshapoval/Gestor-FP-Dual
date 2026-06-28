const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const svc = require('../services/authService');

const router = Router();
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Login con email/CIF + contraseña
router.post('/auth/login', asyncHandler(svc.loginWithCredentials));

// Perfil del usuario autenticado
router.get('/auth/me', requireAuth, asyncHandler(svc.getMe));

// Cambio de contraseña
router.post('/auth/changePassword', requireAuth, asyncHandler(svc.changePassword));

// Admin: gestión de usuarios
router.get('/usuarios', requireAuth, requireRole('ADMINISTRADOR', 'COORDINADOR'), asyncHandler(svc.getAll));
router.post('/usuarios/:id/resetPassword', requireAuth, requireRole('ADMINISTRADOR'), asyncHandler(svc.resetPassword));

module.exports = router;
