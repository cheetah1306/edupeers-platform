const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: 'jacksonhornet1306@gmail.com',
        pass: (process.env.EMAIL_PASS || 'default').trim()
    }
});

async function run() {
    try {
        const info = await transporter.sendMail({
            from: 'jacksonhornet1306@gmail.com',
            to: 'jacksonhornet1306@gmail.com',
            subject: 'Your EduPeers Login OTP',
            text: 'Test OTP'
        });
        console.log('Success:', info.messageId);
    } catch (error) {
        console.error('Email send error:', error);
    }
}
run();
