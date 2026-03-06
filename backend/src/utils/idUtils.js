// OFUSCACIÓN DE IDENTIFICADORES
// Genera un identificador ofuscado a partir de un ID numérico de la base
// de datos. El mismo algoritmo se replica en el frontend (idObfuscation.js)
// para que ambos extremos puedan verificar y construir los IDs.

const LETRAS = 'QRBMUHPWACKZFJLVDXSYIGTNOE';

async function generarId(id) {
  return id * 23 + LETRAS[id % 26];
}

module.exports = { generarId };
