// Night of Fall — secure API-Football proxy for Vercel Node.js Functions.
// Configure API_FOOTBALL_KEY in Vercel Project Settings > Environment Variables.
const API_BASE = 'https://v3.football.api-sports.io';
const ALLOWED_ROUTES = new Set([
  '/fixtures',
  '/fixtures/events',
  '/fixtures/lineups',
  '/fixtures/statistics',
]);

function sendJson(res, status, body, cache = false) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (cache) {
    // Cache identical public fixture queries briefly to reduce API-Football quota use.
    res.setHeader('Vercel-CDN-Cache-Control', 'max-age=60, stale-while-revalidate=120');
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }
  return res.json(body);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return sendJson(res, 503, { error: 'الخادم غير مضبوط: أضف API_FOOTBALL_KEY في إعدادات Vercel ثم أعد النشر.' });

  const route = typeof req.query.route === 'string' ? req.query.route : '';
  if (!ALLOWED_ROUTES.has(route)) return sendJson(res, 404, { error: 'Endpoint not allowed.' });

  const params = new URLSearchParams();
  if (route === '/fixtures') {
    const date = typeof req.query.date === 'string' ? req.query.date : '';
    const timezone = typeof req.query.timezone === 'string' ? req.query.timezone : 'Asia/Baghdad';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return sendJson(res, 400, { error: 'تاريخ غير صالح؛ استخدم YYYY-MM-DD.' });
    if (!/^[A-Za-z_]+(?:\/[A-Za-z_+-]+)*$/.test(timezone)) return sendJson(res, 400, { error: 'Timezone غير صالح.' });
    params.set('date', date);
    params.set('timezone', timezone);
  } else {
    const fixture = typeof req.query.fixture === 'string' ? req.query.fixture : '';
    if (!/^\d+$/.test(fixture)) return sendJson(res, 400, { error: 'رقم المباراة غير صالح.' });
    params.set('fixture', fixture);
  }

  try {
    const upstream = await fetch(`${API_BASE}${route}?${params.toString()}`, {
      method: 'GET',
      headers: { 'x-apisports-key': key, 'Accept': 'application/json' },
    });
    const raw = await upstream.text();
    let payload;
    try { payload = JSON.parse(raw); }
    catch { return sendJson(res, 502, { error: 'مزود البيانات أرسل استجابة غير مفهومة.' }); }

    if (!upstream.ok) {
      const status = upstream.status === 429 ? 429 : 502;
      const message = upstream.status === 429
        ? 'تم بلوغ حد الطلبات لدى مزود البيانات. حاول لاحقًا.'
        : 'تعذر جلب البيانات من مزود المباريات.';
      return sendJson(res, status, { error: message, errors: payload.errors || {} });
    }
    if (payload.errors && Object.keys(payload.errors).length) {
      return sendJson(res, 502, { error: 'مزود البيانات أرجع خطأ.', errors: payload.errors });
    }
    return sendJson(res, 200, payload, true);
  } catch (err) {
    return sendJson(res, 502, { error: 'تعذر الاتصال بمزود البيانات من الخادم.' });
  }
};
