require('dotenv').config({ path: __dirname + '/.env', override: true });
const { GoogleGenAI } = require('@google/genai');

async function testStructuredChat() {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim().replace(/^['"]|['"]$/g, '');
    const ai = new GoogleGenAI({ apiKey });

    const contents = [
        { role: 'user', parts: [{ text: 'What is the difference between synchronous and asynchronous code in JavaScript?' }] }
    ];

    try {
        const response = await ai.models.generateContent({
            model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
            config: {
                systemInstruction: {
                    parts: [{ text: 'You are the EduPeers Expert AI Academic Tutor. Provide structured, clear technical explanations in Markdown.' }]
                }
            },
            contents: contents
        });

        console.log('✅ Structured Chat Response Success!\n');
        console.log(response.text.substring(0, 300) + '...');
    } catch (err) {
        console.error('❌ Error with config:', err);
    }
}

testStructuredChat();
