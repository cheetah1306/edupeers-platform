const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

async function test() {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    try {
        console.log('Testing with model:', process.env.GEMINI_MODEL || 'gemini-1.5-flash');
        const response = await ai.models.generateContent({
            model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
            contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
        });
        console.log('Response structure:', JSON.stringify(Object.keys(response)));
        console.log('Response text (property):', response.text);
        // console.log('Response text (function):', response.text()); // May throw
    } catch (err) {
        console.error('Error during test:', err);
    }
}

test();
