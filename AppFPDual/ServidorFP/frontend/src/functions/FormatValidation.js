// Este fichero tiene todas las funciones que se usen para validar formatos establecidos de información

export function dniNieValido(dniNie) {
    const dniRegex = /^[0-9]{8}[A-Z]$/;
    const nieRegex = /^[XYZ][0-9]{7}[A-Z]$/;
    // Todas las posibles letras que pueden tener los DNI/NIE
    const letras = "TRWAGMYFPDXBNJZSQVHLCKE";
    // Si es un DNI, se calcula la letra que corresponde al resto
    // del número del DNI /23.
    if (dniRegex.test(dniNie)) {
        // EL 10 tras dniNie.substring(0, 8) indica que se parsea a base decimal.
        // Esto es necesario ya que si no el número podría ser interpretado 
        // como base octal si empezase por 0.
        const numero = parseInt(dniNie.substring(0, 8), 10);
        const letraEsperada = letras[numero % 23];
        return dniNie[8] === letraEsperada;
    }     
    // Si es un NIE, se saca el primer dígito en función de la 
    // letra en la primera posicion, tras eso funciona igual.
    else if (nieRegex.test(dniNie)) {
        let primerDigito;
        switch (dniNie[0]) {
            case 'X': primerDigito = '0'; break;
            case 'Y': primerDigito = '1'; break;
            case 'Z': primerDigito = '2'; break;
            default: return false;
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
    // A diferencia de en programación, que empezamos a contar en el 0,
    // el algoritmo del CIF considera que la primera posición es la 1,
    // de ahí que sumaPar y sumaImpar puedan parecer puestos al revés.
    for (let i = 0; i < numero.length; i++) {
        let n = parseInt(numero[i]);
        if (i % 2 === 0) {
            let doble = n * 2;
            if (doble > 9) doble -= 9;
            sumaImpar += doble;
        } else {
            sumaPar += n;
        }
    }
    const total = sumaPar + sumaImpar;
    const letras = 'JABCDEFGHI';
    const letra = cif[0];
    const valorControl = cif[8];
    const valorCalculado = (10 - (total % 10)) % 10;
    // En función del valor de la letra inicial del CIF, comprobaremos que la 
    // octava posición del mismo (valorControl) tenga el mismo valor que el 
    // número que hemos calculado, o que nuestro valor calculado corresponda
    // a la posición de la letra de nuestro array "letras" ubicada en valorControl.
    // En algunos casos ambas opciones pueden servir.
    if ('PQRSNW'.includes(letra)) {
        return valorControl === letras[valorCalculado];
    }
    if ('ABEH'.includes(letra)) {
        return valorControl === String(valorCalculado);
    }
    return valorControl === String(valorCalculado) || valorControl === letras[valorCalculado];
}

// Esta función no hace falta si la fecha sale de un form, solo es necesaria
// cuando sacas la fecha con un New Date()
export function validDate(date) {
    const year = date.getFullYear();
    // padStart asegura que siempre haya dos dígitos en 
    // los campos en los que se aplica, añadiendo 0 si
    // hace falta. Solo funciona con Strings.
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}