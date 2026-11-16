// The main journey through the real app, in a real browser, one step after
// another on the same synthetic database:
//   1. a student applies through the public form (PDFs and password);
//   2. coordination validates the CV, the Anexo DGA and the application;
//   3. the company (already validated, with places) books the student as Beca;
//   4. the student sees the booking in the portal;
//   5. coordination opens the booking: contract Beca, so the Anexo III applies.
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const datos = () => JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.e2e.local.json'), 'utf8'));
const ALUMNA = { dni: '12345678Z', nombre: 'Ana Ruiz Gil', password: 'clave-e2e-1234' };
const pdf = (name) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4\n% ${name}\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n`) });

test.describe.configure({ mode: 'serial' });

async function entrar(page, usuario, password) {
  await page.goto('/login');
  await page.locator('#login-usuario').fill(usuario);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test('1. a student applies through the public form', async ({ page }) => {
  const { ciclo } = datos();
  await page.goto('/addDualStudent');
  await page.getByLabel(/^Email del centro/).fill('ana.ruiz@zaragoza.salesianos.edu');
  const selectCiclo = page.getByLabel(/^Ciclo \(especialidad\)/);
  const opcion = selectCiclo.locator('option', { hasText: ciclo });
  await expect(opcion).toHaveCount(1);
  await selectCiclo.selectOption(await opcion.getAttribute('value'));
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await expect(page.getByRole('heading', { name: 'Datos personales' })).toBeVisible();
  await page.getByLabel(/^DNI \/ NIE/).fill(ALUMNA.dni);
  await page.getByLabel(/^Nombre y apellidos/).fill(ALUMNA.nombre);
  await page.getByLabel(/^Fecha de nacimiento/).fill('2000-05-01');
  await page.getByLabel(/^Nacionalidad/).fill('Española');
  await page.getByLabel('Mujer').check();
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await expect(page.getByRole('heading', { name: 'Contacto y movilidad' })).toBeVisible();
  await page.getByLabel(/^Email personal/).fill('ana@example.test');
  await page.getByLabel(/^Teléfono/).fill('600123456');
  await page.getByLabel(/^Domicilio/).fill('C/ Ficticia 2');
  await page.getByLabel(/^Código postal/).fill('50002');
  await page.getByLabel(/^Localidad/).fill('Zaragoza');
  await page.getByRole('group', { name: /carnet de conducir/ }).getByLabel('Sí').check();
  await page.getByRole('group', { name: /vehículo/ }).getByLabel('No').check();
  await page.getByLabel(/^Idiomas y nivel/).fill('Inglés B2');
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await expect(page.getByRole('heading', { name: 'Documentos' })).toBeVisible();
  await page.getByLabel(/^Currículum \(PDF\)/).first().setInputFiles(pdf('cv.pdf'));
  await page.getByLabel(/^Anexo DGA \(PDF\)/).first().setInputFiles(pdf('dga.pdf'));
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await expect(page.getByRole('heading', { name: 'Tu firma' })).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await page.getByLabel(/^Contraseña/).first().fill(ALUMNA.password);
  await page.getByLabel(/^Repetir contraseña/).fill(ALUMNA.password);
  await page.getByRole('button', { name: 'Siguiente →' }).click();

  await expect(page.getByRole('heading', { name: 'Revisión y envío' })).toBeVisible();
  await page.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(page.getByText('Solicitud enviada')).toBeVisible();
});

test('2. coordination validates the documents and the application', async ({ page }) => {
  const { coordinador } = datos();
  await entrar(page, coordinador.email, coordinador.password);
  await page.goto('/alumnos');
  const tarjeta = page.locator('div', { has: page.getByText(ALUMNA.nombre, { exact: true }) }).filter({ has: page.getByRole('tab', { name: 'Información' }) }).last();
  await expect(tarjeta).toBeVisible();
  await page.getByRole('button', { name: `Mostrar el detalle de ${ALUMNA.nombre}` }).click();

  const validarAlumno = tarjeta.getByRole('button', { name: 'Validar alumno' });
  await expect(validarAlumno).toBeDisabled();
  // CV and Anexo DGA, one after the other: each disappears from the review once validated.
  const validar = tarjeta.getByRole('button', { name: 'Validar', exact: true });
  await expect(validar).toHaveCount(2);
  await validar.first().click();
  await expect(validar).toHaveCount(1);
  await validar.first().click();
  await expect(validar).toHaveCount(0);
  await expect(tarjeta.getByText('Validado', { exact: true })).toHaveCount(2);
  await expect(tarjeta.getByText('Documentación completa')).toBeVisible();
  await validarAlumno.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Validar y avisar' }).click();
  await expect(page.getByText('Solicitud validada.')).toBeVisible();
});

test('3. the company books the student as Beca', async ({ page }) => {
  const { empresa } = datos();
  await entrar(page, empresa.cif, empresa.password);
  await page.goto('/alumnos');
  await expect(page.getByText(ALUMNA.nombre)).toBeVisible();
  await page.getByRole('button', { name: 'Reservar alumno' }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Tipo de contrato').selectOption({ label: 'Beca' });
  await expect(dialogo.getByText('Esta reserva usará el Anexo III.')).toBeVisible();
  await dialogo.getByRole('button', { name: 'Reservar' }).click();
  await expect(page.getByText('Reserva creada.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancelar reserva' })).toBeVisible();
});

test('4. the student sees the booking in the portal', async ({ page }) => {
  const { empresa } = datos();
  await entrar(page, ALUMNA.dni, ALUMNA.password);
  await expect(page).toHaveURL(/\/studentMain/);
  await expect(page.getByText('Tienes una reserva pendiente de confirmación.')).toBeVisible();
  await page.getByRole('tab', { name: /Mis reservas/ }).click();
  await expect(page.getByText(`${empresa.nombre} ha reservado tu candidatura.`, { exact: false })).toBeVisible();
});

test('5. coordination opens the booking: Beca, so the Anexo III applies', async ({ page }) => {
  const { coordinador, empresa } = datos();
  await entrar(page, coordinador.email, coordinador.password);
  await page.goto('/reservas');
  await page.getByRole('button', { name: `Gestionar la reserva de ${ALUMNA.nombre} en ${empresa.nombre}` }).click();
  const panel = page.getByRole('dialog', { name: `${ALUMNA.nombre} · ${empresa.nombre}` });
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel('Tipo de contrato', { exact: true })).toHaveValue('1');
  await expect(panel.getByText('Anexo III').first()).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Confirmar reserva' })).toHaveCount(0);
});
