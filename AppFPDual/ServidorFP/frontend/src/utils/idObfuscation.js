// UTILIDADES para ofuscar y verificar IDs en las URLs.
// Esto evita que se accedan a rutas sensibles con IDs arbitrarios.

const LETRAS = 'QRBMUHPWACKZFJLVDXSYIGTNOE';

// Genera el ID ofuscado a partir del idGestion numérico.
export const ofuscarId = (idGestion) => {
  if (!idGestion) return '0';
  return `${idGestion * 23}${LETRAS[idGestion % 26]}`;
};

// Devuelve true si el ID de la URL es válido, false si no lo es.
export const verificarId = (id) => {
  if (!id || id === '0') return false;
  const numero = id.slice(0, -1);
  const letraControl = id.slice(-1);
  if (numero % 23 !== 0) return false;
  return letraControl === LETRAS[(numero / 23) % 26];
};
