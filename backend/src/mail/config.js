const dotenv = require('dotenv');
dotenv.config();

const nodemailer = require('nodemailer');

// Delivery mode (Phase 4). Every email of the application goes through this
// `transporter`, so the mode applies to all of them:
//   MAIL_MODE=smtp  sends through Gmail (EMAIL_USER / EMAIL_PASS).
//   MAIL_MODE=log   sends nothing; writes event, masked recipient and subject
//                   to the server log. Default outside NODE_ENV=production,
//                   so development and tests never email students or companies.
//   MAIL_REDIRECT_TO=<address>  (smtp only) delivers every email to that one
//                   address instead, for checking templates with real delivery.
const MODE = (process.env.MAIL_MODE || (process.env.NODE_ENV === 'production' ? 'smtp' : 'log')).toLowerCase();
const REDIRECT = (process.env.MAIL_REDIRECT_TO || '').trim();

function maskEmail(value) {
    const text = String(value || '');
    const at = text.indexOf('@');
    if (at < 1) return text ? '***' : '(sin destinatario)';
    return `${text[0]}***${text.slice(at)}`;
}

let smtp = null;
if (MODE === 'smtp') {
    try {
        smtp = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });
    } catch (error) {
        console.log("Error al crear la conexión con nodemailer");
    }
}

const transporter = {
    mode: MODE,
    async sendMail(options) {
        const to = [].concat(options.to || []).join(', ');
        if (MODE !== 'smtp') {
            console.log(`[correo:${MODE}] no enviado · para ${maskEmail(to)} · «${options.subject}»`);
            return { simulated: true };
        }
        if (!smtp) throw new Error('El correo no está configurado (EMAIL_USER / EMAIL_PASS).');
        if (REDIRECT) {
            return smtp.sendMail({ ...options, to: REDIRECT, subject: `[para ${maskEmail(to)}] ${options.subject}` });
        }
        return smtp.sendMail(options);
    },
};

console.log(`[correo] modo de envío: ${MODE}${MODE === 'smtp' && REDIRECT ? ` (redirigido a ${maskEmail(REDIRECT)})` : ''}`);

module.exports = { transporter, maskEmail, MAIL_MODE: MODE, MAIL_REDIRECT_TO: REDIRECT };
