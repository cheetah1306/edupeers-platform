require('dotenv').config({ path: __dirname + '/.env', override: true });
const OpenAI = require('openai');

function sanitizeApiKey(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/^\uFEFF/, '').trim().replace(/^['"]|['"]$/g, '');
}

async function testGroq() {
    const key = sanitizeApiKey(process.env.GROQ_API_KEY);
    const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
    console.log('Testing Groq model:', model);
    console.log('Groq key present:', Boolean(key));
    try {
        const client = new OpenAI({
            apiKey: key,
            baseURL: 'https://api.groq.com/openai/v1'
        });
        const completion = await client.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: 'You are a helpful academic tutor.' },
                { role: 'user', content: 'Say hello in one sentence.' }
            ]
        });
        console.log('Groq success:', completion.choices[0].message.content);
    } catch (e) {
        console.error('Groq error:', e.status, e.message ? e.message.substring(0, 300) : e);
    }
}

testGroq();