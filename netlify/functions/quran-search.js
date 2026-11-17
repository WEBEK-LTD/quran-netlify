// netlify/functions/quran-search.js
// Proxies alquran.cloud search to avoid browser CORS restrictions

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { q, edition = 'quran-simple' } = event.queryStringParameters || {};

  if (!q || q.trim().length < 2) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'يجب أن يكون البحث حرفين على الأقل' }),
    };
  }

  try {
    const encoded = encodeURIComponent(q.trim());
    const url = `https://api.alquran.cloud/v1/search/${encoded}/all/${edition}`;

    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    const data = await res.json();

    if (!res.ok || data.code !== 200) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: data.message || 'فشل البحث' }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600', // cache 1hr
      },
      body: JSON.stringify({ matches: data.data?.matches || [] }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'تعذّر الاتصال بخادم البحث' }),
    };
  }
};
