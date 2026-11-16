const dotenv = require('dotenv');
dotenv.config();

const nodemailer = require('nodemailer');

// Delivery mode. Every email of the application goes through this
// `transporter`, so the mode applies to all of them:
//   MAIL_MODE=smtp     sends for real. Through Gmail (EMAIL_USER / EMAIL_PASS,
//                      an app password) unless SMTP_HOST names another server
//                      (SMTP_PORT, SMTP_SECURE=true for port 465; EMAIL_USER /
//                      EMAIL_PASS as its login, if it needs one).
//   MAIL_MODE=mailpit  sends every email to Mailpit, a local mail catcher with
//                      a web inbox (port 8025). Nothing leaves the machine and no
//                      real credentials are needed: for development and demos.
//                      Host MAILPIT_HOST (docker-compose sets "mailpit"; default
//                      localhost), port MAILPIT_PORT (default 1025).
//   MAIL_MODE=log      sends nothing; writes event, masked recipient and subject
//                      to the server log. Default outside NODE_ENV=production,
//                      so development and tests never email students or companies.
//   MAIL_REDIRECT_TO=<address>  (smtp only) delivers every email to that one
//                      address instead, for checking templates with real delivery.
//   MAIL_FROM          sender address (default EMAIL_USER, or fpdual@localhost).
const MODES = ['smtp', 'mailpit', 'log'];
const pedido = (process.env.MAIL_MODE || (process.env.NODE_ENV === 'production' ? 'smtp' : 'log')).trim().toLowerCase();
const MODE = MODES.includes(pedido) ? pedido : 'log';
if (!MODES.includes(pedido)) console.warn(`[correo] MAIL_MODE=${pedido} no existe (smtp, mailpit o log): no se enviará ningún correo.`);
const REDIRECT = MODE === 'smtp' ? (process.env.MAIL_REDIRECT_TO || '').trim() : '';
const FROM_ADDRESS = (process.env.MAIL_FROM || process.env.EMAIL_USER || 'fpdual@localhost').trim();
const FROM = FROM_ADDRESS.includes('<') ? FROM_ADDRESS : `"Salesianos Dual" <${FROM_ADDRESS}>`;

function maskEmail(value) {
    const text = String(value || '');
    const at = text.indexOf('@');
    if (at < 1) return text ? '***' : '(sin destinatario)';
    return `${text[0]}***${text.slice(at)}`;
}

// Options for nodemailer.createTransport, or null when nothing is sent.
function opcionesTransporte() {
    if (MODE === 'mailpit') {
        return {
            host: process.env.MAILPIT_HOST || 'localhost',
            port: Number(process.env.MAILPIT_PORT) || 1025,
            secure: false,
            ignoreTLS: true,
        };
    }
    if (MODE !== 'smtp') return null;
    const auth = process.env.EMAIL_USER ? { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } : undefined;
    const host = (process.env.SMTP_HOST || '').trim();
    if (!host) return { service: 'gmail', auth };
    const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
    return { host, port: Number(process.env.SMTP_PORT) || (secure ? 465 : 587), secure, auth };
}

let smtp = null;
const opciones = opcionesTransporte();
if (opciones) {
    try {
        smtp = nodemailer.createTransport(opciones);
    } catch (error) {
        console.log("Error al crear la conexión con nodemailer");
    }
}

function descripcion() {
    if (MODE === 'mailpit') return `mailpit (${opciones.host}:${opciones.port})`;
    if (MODE === 'smtp') {
        const servidor = opciones.service || `${opciones.host}:${opciones.port}`;
        return `smtp (${servidor})${REDIRECT ? ` redirigido a ${maskEmail(REDIRECT)}` : ''}`;
    }
    return MODE;
}

const transporter = {
    mode: MODE,
    // true when emails really leave this process (smtp or mailpit).
    entrega: MODE !== 'log',
    async sendMail(options) {
        const to = [].concat(options.to || []).join(', ');
        if (MODE === 'log') {
            console.log(`[correo:${MODE}] no enviado · para ${maskEmail(to)} · «${options.subject}»`);
            return { simulated: true };
        }
        if (!smtp) throw new Error('El correo no está configurado (revisa MAIL_MODE, SMTP_HOST, EMAIL_USER / EMAIL_PASS).');
        const mensaje = { from: FROM, ...options };
        if (REDIRECT) {
            return smtp.sendMail({ ...mensaje, to: REDIRECT, subject: `[para ${maskEmail(to)}] ${options.subject}` });
        }
        return smtp.sendMail(mensaje);
    },
};

console.log(`[correo] modo de envío: ${descripcion()}`);

module.exports = { transporter, maskEmail, MAIL_MODE: MODE, MAIL_REDIRECT_TO: REDIRECT, MAIL_FROM: FROM };
