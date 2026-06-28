// Obfuscates numeric IDs used in sensitive URL params to prevent arbitrary access.

const LETRAS = 'QRBMUHPWACKZFJLVDXSYIGTNOE';

// Encodes a numeric ID by multiplying by 23 and appending a control letter
export const ofuscarId = (idGestion) => {
  if (!idGestion) return '0';
  return `${idGestion * 23}${LETRAS[idGestion % 26]}`;
};

// Returns true only if the obfuscated ID passes the control-letter check
export const verificarId = (id) => {
  if (!id || id === '0') return false;
  const numero = id.slice(0, -1);
  const letraControl = id.slice(-1);
  if (numero % 23 !== 0) return false;
  return letraControl === LETRAS[(numero / 23) % 26];
};
