// Every API endpoint and the access it requires, read from the real routers.
// If a route is added, removed or its roles change, this test fails until the
// table below is updated on purpose: no endpoint changes access by accident.
//   PUBLIC        no login (forms, login, password reset, catalogues, help)
//   AUTH          logged in, any role
//   AUTH_PWD      logged in, also while a password change is pending
//   ROLE:a,b      logged in with one of those roles
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { stub, fakePool } = require('./helpers/harness');

stub('src/db/pool', fakePool(() => []));
const tag = (fn, t) => Object.assign(fn, { _tag: t });
stub('src/middleware/auth', {
  requireAuth: tag((_q, _s, n) => n(), 'AUTH'),
  requireAuthAllowPasswordChange: tag((_q, _s, n) => n(), 'AUTH_PWD'),
  // Public: it only tells the route who is asking, it never refuses.
  optionalAuth: (_q, _s, n) => n(),
  requireRole: (...roles) => tag((_q, _s, n) => n(), `ROLE:${roles.join(',')}`),
  signToken: () => '',
  getJwtSecret: () => 'test',
  passwordFingerprint: () => '',
});

const ESPERADO = [
  'POST /auth/login :: PUBLIC',
  'POST /auth/forgotPassword :: PUBLIC',
  'POST /auth/resetPassword :: PUBLIC',
  'GET /auth/me :: AUTH_PWD',
  'POST /auth/changePassword :: AUTH_PWD',
  'GET /usuarios :: AUTH ROLE:ADMINISTRADOR',
  'GET /usuarios/personal :: AUTH ROLE:ADMINISTRADOR',
  'POST /usuarios/personal :: AUTH ROLE:ADMINISTRADOR',
  'PATCH /usuarios/personal/:id :: AUTH ROLE:ADMINISTRADOR',
  'POST /usuarios/personal/:id/baja :: AUTH ROLE:ADMINISTRADOR',
  'POST /usuarios/personal/:id/reactivar :: AUTH ROLE:ADMINISTRADOR',
  'POST /usuarios/:id/resetPassword :: AUTH ROLE:ADMINISTRADOR',
  'GET /convocatorias/activa :: PUBLIC',
  'GET /convocatorias/estado :: PUBLIC',
  'GET /convocatorias :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'POST /convocatorias :: AUTH ROLE:ADMINISTRADOR',
  'PUT /convocatorias/:id :: AUTH ROLE:ADMINISTRADOR',
  'GET /especialidades :: PUBLIC',
  'GET /transportes :: PUBLIC',
  'GET /tiposContrato :: PUBLIC',
  'POST /solicitudes/alumno :: PUBLIC',
  'GET /solicitudes/alumno/mia :: AUTH ROLE:ALUMNO',
  'GET /solicitudes/alumno/mia/datos :: AUTH ROLE:ALUMNO',
  'POST /solicitudes/alumno/mia/cambios :: AUTH ROLE:ALUMNO',
  'GET /solicitudes/alumno :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'GET /solicitudes/alumno/:id :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'POST /solicitudes/alumno/:id/validar :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'POST /solicitudes/alumno/:id/rechazar :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'POST /solicitudes/alumno/:id/reabrir :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'GET /solicitudes/alumno/:id/datos :: AUTH ROLE:ADMINISTRADOR',
  'PUT /solicitudes/alumno/:id/datos :: AUTH ROLE:ADMINISTRADOR',
  'GET /solicitudes/alumno/:id/cambios :: AUTH ROLE:ADMINISTRADOR',
  'POST /solicitudes/alumno/:id/cambios/:idCambio/aprobar :: AUTH ROLE:ADMINISTRADOR',
  'POST /solicitudes/alumno/:id/cambios/:idCambio/rechazar :: AUTH ROLE:ADMINISTRADOR',
  'GET /solicitudes/alumno/:id/baja :: AUTH ROLE:ADMINISTRADOR',
  'POST /solicitudes/alumno/:id/baja :: AUTH ROLE:ADMINISTRADOR',
  'POST /solicitudes/alumno/:id/reactivar :: AUTH ROLE:ADMINISTRADOR',
  'GET /solicitudes/alumno/:id/documentos :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'POST /solicitudes/empresa :: PUBLIC',
  'POST /solicitudes/empresa/reapply :: AUTH ROLE:EMPRESA',
  'GET /solicitudes/empresa/mia :: AUTH ROLE:EMPRESA',
  'GET /solicitudes/empresa/todas :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'GET /solicitudes/empresa :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'GET /solicitudes/empresa/:id :: AUTH ROLE:ADMINISTRADOR,COORDINADOR,EMPRESA',
  'GET /solicitudes/empresa/:id/especialidades :: AUTH ROLE:ADMINISTRADOR,COORDINADOR,EMPRESA',
  'POST /solicitudes/empresa/:id/especialidades :: AUTH ROLE:ADMINISTRADOR,COORDINADOR,EMPRESA',
  'PUT /solicitudes/empresa/:id/especialidades/:idOferta/cantidad :: AUTH ROLE:ADMINISTRADOR,COORDINADOR,EMPRESA',
  'GET /solicitudes/empresa/:id/documentos :: AUTH ROLE:ADMINISTRADOR,COORDINADOR,EMPRESA',
  'GET /solicitudes/empresa/:id/datos :: AUTH ROLE:ADMINISTRADOR,COORDINADOR,EMPRESA',
  'PUT /solicitudes/empresa/:id/datos :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'GET /solicitudes/empresa/:id/cambios :: AUTH ROLE:ADMINISTRADOR,COORDINADOR,EMPRESA',
  'POST /solicitudes/empresa/:id/cambios :: AUTH ROLE:EMPRESA',
  'POST /solicitudes/empresa/:id/cambios/:idCambio/aprobar :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'POST /solicitudes/empresa/:id/cambios/:idCambio/rechazar :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'POST /solicitudes/empresa/:id/validar :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'POST /solicitudes/empresa/:id/rechazar :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'POST /solicitudes/empresa/:id/reabrir :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'GET /solicitudes/empresa/:id/baja :: AUTH ROLE:ADMINISTRADOR',
  'POST /solicitudes/empresa/:id/baja :: AUTH ROLE:ADMINISTRADOR',
  'POST /solicitudes/empresa/:id/reactivar :: AUTH ROLE:ADMINISTRADOR',
  'POST /documentos/alumno/:idSolicitud/:tipo :: AUTH ROLE:ADMINISTRADOR,COORDINADOR,ALUMNO',
  'GET /documentos/alumno/mios :: AUTH ROLE:ALUMNO',
  'GET /documentos/seguimiento :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'POST /documentos/generar :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'POST /documentos/convenios/generar-pendientes :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'POST /documentos/subir :: AUTH ROLE:ADMINISTRADOR,COORDINADOR,EMPRESA,ALUMNO',
  'POST /documentos/firmar :: AUTH ROLE:ADMINISTRADOR,COORDINADOR,EMPRESA,ALUMNO',
  'POST /documentos/:id/firmar :: AUTH ROLE:ADMINISTRADOR,COORDINADOR,EMPRESA,ALUMNO',
  'POST /documentos/empresa/:idSolicitud/convenio :: AUTH ROLE:ADMINISTRADOR,COORDINADOR,EMPRESA',
  'POST /documentos/reserva/:idReserva/anexo :: AUTH ROLE:ADMINISTRADOR,COORDINADOR,EMPRESA',
  'GET /documentos/empresa :: AUTH ROLE:EMPRESA',
  'GET /documentos/:id/descargar :: AUTH',
  'POST /documentos/:id/validar :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'POST /documentos/:id/rechazar :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'GET /documentos/plantillas :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'POST /documentos/plantillas :: AUTH ROLE:ADMINISTRADOR',
  'GET /documentos/plantillas/:id/descargar :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'GET /alumnos/disponibles :: AUTH ROLE:EMPRESA',
  'GET /cupos/empresa :: AUTH ROLE:EMPRESA',
  'GET /reservas :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'GET /reservas/empresa :: AUTH ROLE:EMPRESA',
  'GET /reservas/alumno :: AUTH ROLE:ALUMNO',
  'GET /reservas/:id/detalle :: AUTH ROLE:ADMINISTRADOR,COORDINADOR,EMPRESA,ALUMNO',
  'GET /reservas/ofertas-elegibles :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'GET /reservas/alumnos-elegibles :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'POST /reservas :: AUTH ROLE:EMPRESA',
  'POST /reservas/admin :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'POST /reservas/:id/cancelar :: AUTH ROLE:EMPRESA',
  'POST /reservas/:id/cancelar-admin :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'POST /reservas/:id/reasignar :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'POST /reservas/:id/tipo-contrato :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'POST /reservas/:id/confirmar :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'GET /tutores/empresa :: AUTH ROLE:EMPRESA',
  'POST /tutores/empresa :: AUTH ROLE:EMPRESA',
  'GET /tutores/empresa/:idEmpresa :: AUTH ROLE:ADMINISTRADOR,COORDINADOR,EMPRESA',
  'POST /tutores/empresa/:idEmpresa :: AUTH ROLE:ADMINISTRADOR,COORDINADOR,EMPRESA',
  'PATCH /tutores/:id :: AUTH ROLE:ADMINISTRADOR,COORDINADOR,EMPRESA',
  'POST /tutores/:id/desactivar :: AUTH ROLE:ADMINISTRADOR,COORDINADOR,EMPRESA',
  'PATCH /reservas/:id/tutor :: AUTH ROLE:ADMINISTRADOR,COORDINADOR,EMPRESA',
  'GET /panel/resumen :: AUTH ROLE:ADMINISTRADOR,COORDINADOR',
  'GET /ayuda/manual :: PUBLIC',
  'GET /ayuda/imagenes/:file :: PUBLIC',
  'GET /correos :: AUTH ROLE:ADMINISTRADOR',
  'GET /correos/:clave :: AUTH ROLE:ADMINISTRADOR',
  'PUT /correos/:clave :: AUTH ROLE:ADMINISTRADOR',
  'POST /correos/:clave/restaurar :: AUTH ROLE:ADMINISTRADOR',
  'POST /correos/:clave/vista-previa :: AUTH ROLE:ADMINISTRADOR',
  'POST /correos/:clave/prueba :: AUTH ROLE:ADMINISTRADOR',
  'POST /correos/:clave/adjuntos :: AUTH ROLE:ADMINISTRADOR',
  'POST /correos/:clave/adjuntos/archivo :: AUTH ROLE:ADMINISTRADOR',
  'DELETE /correos/:clave/adjuntos/:id :: AUTH ROLE:ADMINISTRADOR',
  'GET /correos/:clave/adjuntos/:id/archivo :: AUTH ROLE:ADMINISTRADOR',
];

function rutas() {
  const router = require(path.join(__dirname, '..', 'src', 'routes', 'index.js'));
  const out = [];
  for (const layer of router.stack) {
    for (const l of layer.handle?.stack || []) {
      if (!l.route) continue;
      const metodos = Object.keys(l.route.methods).map((m) => m.toUpperCase()).join(',');
      const marcas = l.route.stack.map((s) => s.handle._tag).filter(Boolean);
      out.push(`${metodos} ${l.route.path} :: ${marcas.join(' ') || 'PUBLIC'}`);
    }
  }
  return out;
}

test('every endpoint requires exactly the access in the table', () => {
  const reales = rutas();
  const sobran = reales.filter((r) => !ESPERADO.includes(r));
  const faltan = ESPERADO.filter((r) => !reales.includes(r));
  assert.deepEqual({ cambiadas_o_nuevas: sobran, quitadas: faltan }, { cambiadas_o_nuevas: [], quitadas: [] });
  assert.equal(new Set(reales).size, reales.length, 'no endpoint is declared twice');
});

test('login always comes before the role check', () => {
  for (const r of rutas()) {
    const marcas = r.split(' :: ')[1];
    if (marcas === 'PUBLIC') continue;
    assert.match(marcas, /^AUTH(_PWD)? (ROLE:[A-Z,]+)?|^AUTH(_PWD)?$/, r);
  }
});

test('only the expected endpoints are public', () => {
  const publicas = rutas().filter((r) => r.endsWith(':: PUBLIC')).map((r) => r.split(' :: ')[0]);
  assert.deepEqual(publicas.sort(), [
    'GET /ayuda/imagenes/:file',
    'GET /ayuda/manual',
    'GET /convocatorias/activa',
    'GET /convocatorias/estado',
    'GET /especialidades',
    'GET /tiposContrato',
    'GET /transportes',
    'POST /auth/forgotPassword',
    'POST /auth/login',
    'POST /auth/resetPassword',
    'POST /solicitudes/alumno',
    'POST /solicitudes/empresa',
  ]);
});

test('staff-only areas are never open to companies or students', () => {
  const soloPersonal = /^(GET|POST|PUT|PATCH|DELETE) \/(usuarios|correos|panel|convocatorias(?!\/(activa|estado)))/;
  for (const r of rutas().filter((x) => soloPersonal.test(x))) {
    assert.ok(!/EMPRESA|ALUMNO/.test(r), r);
    assert.match(r, /ROLE:/, r);
  }
});
