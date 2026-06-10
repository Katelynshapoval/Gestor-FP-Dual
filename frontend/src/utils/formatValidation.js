// Validación de formatos de documentos y fechas

export function dniNieValido(dniNie) {
  const dniRegex = /^[0-9]{8}[A-Z]$/;
  const nieRegex = /^[XYZ][0-9]{7}[A-Z]$/;
  const letras = "TRWAGMYFPDXBNJZSQVHLCKE";

  if (dniRegex.test(dniNie)) {
    const numero = parseInt(dniNie.substring(0, 8), 10);
    const letraEsperada = letras[numero % 23];
    return dniNie[8] === letraEsperada;
  }

  if (nieRegex.test(dniNie)) {
    let primerDigito;
    switch (dniNie[0]) {
      case "X":
        primerDigito = "0";
        break;
      case "Y":
        primerDigito = "1";
        break;
      case "Z":
        primerDigito = "2";
        break;
      default:
        return false;
    }
    const numero = parseInt(primerDigito + dniNie.substring(1, 8), 10);
    const letraEsperada = letras[numero % 23];
    return dniNie[8] === letraEsperada;
  }

  return false;
}

export function nSSValido(nss) {
  const numero = nss.slice(0, -2);
  const control = parseInt(nss.slice(-2), 10);
  const numeroCompleto = parseInt(numero, 10);
  const calculado = numeroCompleto % 97;
  return calculado === control;
}

export function cifValido(cif) {
  let sumaPar = 0;
  let sumaImpar = 0;
  const numero = cif.substring(1, 8);

  for (let i = 0; i < numero.length; i++) {
    const n = parseInt(numero[i]);
    if (i % 2 === 0) {
      let doble = n * 2;
      if (doble > 9) doble -= 9;
      sumaImpar += doble;
    } else {
      sumaPar += n;
    }
  }

  const total = sumaPar + sumaImpar;
  const letras = "JABCDEFGHI";
  const letra = cif[0];
  const valorControl = cif[8];
  const valorCalculado = (10 - (total % 10)) % 10;

  if ("PQRSNW".includes(letra)) {
    return valorControl === letras[valorCalculado];
  }
  if ("ABEH".includes(letra)) {
    return valorControl === String(valorCalculado);
  }

  return (
    valorControl === String(valorCalculado) ||
    valorControl === letras[valorCalculado]
  );
}

export function validDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
