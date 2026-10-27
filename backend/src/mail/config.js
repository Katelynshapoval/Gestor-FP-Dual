const dotenv = require('dotenv');
dotenv.config();

const nodemailer = require('nodemailer');

let transporter;

try {
    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        },
    });
} catch (error) {
    console.log("Error al crear la conexión con nodemailer");
}

module.exports = { transporter };