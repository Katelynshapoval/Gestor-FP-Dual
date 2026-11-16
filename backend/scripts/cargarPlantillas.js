#!/usr/bin/env node
// Loads the starting templates of backend/required_documents/ as the ACTIVE
// template of each generated document type that has none, so a new
// installation can generate the convenio and the Anexo II / III right away.
// A type that already has an active template (uploaded from «Documentos ›
// Plantillas») is left alone. Administración can replace them there later.
//
//   node scripts/cargarPlantillas.js --yes
//   npm run db:plantillas (development), ./deploy/fpdual.sh plantillas (server)
//
// Needs an active ADMINISTRADOR (the template records who uploaded it):
// create one first with scripts/crearAdmin.js.
const fs = require('fs');
const path = require('path');
const { connect, target } = require('./lib/connect');

const DIR = path.join(__dirname, '..', 'required_documents');
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ARCHIVOS = {
  CONVENIO: 'CONVENIO_GENERAL_PLANTILLA.docx',
  ANEXO_II: 'ANEXOS_II_o_III_Generico_Plantilla.docx',
  ANEXO_III: 'ANEXOS_II_o_III_Generico_Plantilla.docx',
};

async function main() {
  if (!process.argv.includes('--yes')) {
    console.error('Uso: cargarPlantillas.js --yes   (solo carga los tipos sin plantilla activa)');
    process.exit(1);
  }
  const { database, host } = target();
  console.log(`Base de datos: ${database} @ ${host}`);
  const conn = await connect();
  try {
    await conn.beginTransaction();
    const [[admin]] = await conn.query(
      `SELECT u.id_usuario FROM dual_usuarios u JOIN dual_roles r ON r.id_rol = u.id_rol
        WHERE r.nombre = 'ADMINISTRADOR' AND u.activo = 1 ORDER BY u.id_usuario LIMIT 1`,
    );
    if (!admin) throw new Error('No hay ninguna cuenta de ADMINISTRADOR activa: créala antes (scripts/crearAdmin.js).');
    let cargadas = 0;
    for (const [clave, archivo] of Object.entries(ARCHIVOS)) {
      const [[tipo]] = await conn.query(
        'SELECT id_tipo_documento AS id, activo FROM dual_tipos_documento WHERE nombre = ? FOR UPDATE', [clave]);
      if (!tipo || !tipo.activo) {
        console.log(`  ${clave}: el tipo no existe o está desactivado, se omite.`);
        continue;
      }
      const [[activa]] = await conn.query(
        'SELECT version FROM dual_documento_plantillas WHERE id_tipo_documento = ? AND es_activa = 1', [tipo.id]);
      if (activa) {
        console.log(`  ${clave}: ya tiene plantilla activa (versión ${activa.version}), no se toca.`);
        continue;
      }
      const buffer = fs.readFileSync(path.join(DIR, archivo));
      const [[{ v }]] = await conn.query(
        'SELECT COALESCE(MAX(version), 0) + 1 AS v FROM dual_documento_plantillas WHERE id_tipo_documento = ?', [tipo.id]);
      await conn.query(
        `INSERT INTO dual_documento_plantillas (id_tipo_documento, archivo, nombre_archivo, mime_type, version, es_activa, id_usuario_subida)
         VALUES (?, ?, ?, ?, ?, 1, ?)`,
        [tipo.id, buffer, archivo, DOCX_MIME, v, admin.id_usuario],
      );
      console.log(`  ${clave}: cargada ${archivo} (versión ${v}).`);
      cargadas += 1;
    }
    await conn.commit();
    console.log(cargadas ? `✓ ${cargadas} plantilla(s) cargada(s).` : '✓ Nada que cargar.');
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error('Error (no se ha cambiado nada):', err.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();
