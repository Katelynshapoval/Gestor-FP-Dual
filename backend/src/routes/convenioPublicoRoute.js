const { Router } = require('express');
const multer = require('multer');
const pool = require('../db/pool');
const asyncHandler = require('../middleware/asyncHandler');
const { sendSqlError } = require('../helpers/dbHelpers');

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Public: company uploads their signed convenio via a one-time secure token sent by email
router.post('/convenio-publico/:token', upload.single('convenio'), asyncHandler(async (req, res) => {
  const { token } = req.params;
  const file = req.file;

  if (!file) return res.status(400).json({ error: 'No se ha recibido ningún archivo.' });
  if (file.mimetype !== 'application/pdf') return res.status(400).json({ error: 'Solo se aceptan archivos PDF.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [tokenRows] = await conn.query(
      `SELECT id_token, id_solicitud_empresa, expira_en, usado
         FROM dual_convenio_tokens
        WHERE token = ?
        FOR UPDATE`,
      [token]
    );

    const tkn = tokenRows[0];
    if (!tkn) {
      await conn.rollback();
      return res.status(404).json({ error: 'Enlace no válido.' });
    }
    if (tkn.usado) {
      await conn.rollback();
      return res.status(410).json({ error: 'Este enlace ya fue utilizado. Sube el convenio desde tu panel de empresa.' });
    }
    if (new Date(tkn.expira_en) < new Date()) {
      await conn.rollback();
      return res.status(410).json({ error: 'El enlace ha expirado. Contacta con el centro para obtener uno nuevo.' });
    }

    // type 3 = CONVENIO
    await conn.query('CALL sp_guardar_documento(NULL, ?, NULL, 3, ?)', [
      tkn.id_solicitud_empresa, file.buffer,
    ]);

    await conn.query('UPDATE dual_convenio_tokens SET usado = 1 WHERE id_token = ?', [tkn.id_token]);
    await conn.commit();

    return res.json({ message: 'Convenio subido correctamente. Gracias.' });
  } catch (err) {
    await conn.rollback();
    return sendSqlError(res, err);
  } finally {
    conn.release();
  }
}));

module.exports = router;
