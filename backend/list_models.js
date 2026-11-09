const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { GoogleGenAI } = require('@google/genai');

async function test() {
    const aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    try {
        console.log("Listing models...");
        // This is a guess at the listModels method in the new SDK
        // If it fails, we know it's not and we can try something else
        const response = await aiClient.models.list();
        // The list() returns a paginated response that is an async iterable? 
        // Or maybe it has an array in some key I missed.
        // Let's try to just log the whole response correctly.
        console.log("Models:", JSON.stringify(response, (key, value) => {
            if (key === 'sdkHttpResponseInternal' || key === 'paramsInternal' || key === 'requestInternal') return undefined;
            return value;
        }, 2));
    } catch (err) {
        console.error("Listing failed:", err.message);
    }
}

test();
