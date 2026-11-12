// Shape checks for the public, unauthenticated forms (student and company
// sign-up). The browser form already validates; these stop a hand-made request
// from sending arrays/objects where text is expected (500 errors) or using the
// form to send email to arbitrary malformed addresses.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A form value may be missing, a string, a number or a boolean. Arrays and
// objects (JSON bodies, or multipart names like `nombre[x]`) are never valid
// for a text field.
function esEscalar(value) {
  return value == null || ['string', 'number', 'boolean'].includes(typeof value);
}

// First key of `keys` whose value in `body` is not a scalar, or null.
function campoNoEscalar(body, keys) {
  const src = body && typeof body === 'object' ? body : {};
  return keys.find((key) => !esEscalar(src[key])) || null;
}

// reglas: { campo: { max, label, email } }. Checks length and, for email
// fields with a value, the format. Returns the first error message or null.
function revisarTextos(body, reglas) {
  const src = body && typeof body === 'object' ? body : {};
  const noEscalar = campoNoEscalar(src, Object.keys(reglas));
  if (noEscalar) return `El campo "${reglas[noEscalar].label}" no es válido.`;
  for (const [key, regla] of Object.entries(reglas)) {
    const value = src[key] == null ? '' : String(src[key]).trim();
    if (regla.max && value.length > regla.max) {
      return `El campo "${regla.label}" admite como máximo ${regla.max} caracteres.`;
    }
    if (regla.email && value && !EMAIL_RE.test(value)) {
      return `El campo "${regla.label}" no es un email válido.`;
    }
  }
  return null;
}

module.exports = { EMAIL_RE, esEscalar, campoNoEscalar, revisarTextos };
