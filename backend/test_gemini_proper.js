require('dotenv').config({ path: __dirname + '/.env', override: true });
const { GoogleGenAI } = require('@google/genai');

async function testGemini() {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim().replace(/^['"]|['"]$/g, '');
    const modelsToTry = ['gemini-3.6-flash', 'gemini-3.1-pro-preview', 'gemini-2.0-flash-exp', 'gemini-exp-1206'];
    const ai = new GoogleGenAI({ apiKey });

    for (const model of modelsToTry) {
        try {
            console.log(`\nTrying model: ${model}...`);
            const response = await ai.models.generateContent({
                model: model,
                contents: 'Hello! Introduce yourself in one sentence as the EduPeers AI Academic Tutor.'
            });
            console.log(`✅ SUCCESS with ${model}!\nResponse:`, response.text);
            return model;
        } catch (err) {
            console.log(`❌ Failed with ${model}:`, err.message || err);
        }
    }
}

testGemini();
