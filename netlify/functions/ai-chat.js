// netlify/functions/ai-chat.js
// Secure proxy — OPENAI_KEY lives in process.env only, never in the client bundle

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.OPENAI_KEY;
  if (!apiKey) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { message: 'OPENAI_KEY غير مُهيَّأ في متغيرات البيئة' } }),
    };
  }

  let payload;
  try { payload = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  // Build OpenAI messages — prepend system as first message
  const messages = [];
  if (payload.system) {
    messages.push({ role: 'system', content: payload.system });
  }
  (payload.messages || []).forEach(m => messages.push(m));

  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: Math.min(payload.max_tokens || 1024, 2048),
      messages,
    }),
  });

  const data = await upstream.json();

  // Normalise response to match what AIAssistant.jsx expects:
  // { content: [{ text: "..." }] }
  if (upstream.ok && data.choices?.[0]?.message?.content) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: [{ text: data.choices[0].message.content }],
      }),
    };
  }

  // Pass errors through as-is
  return {
    statusCode: upstream.status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
};
