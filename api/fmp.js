// api/fmp.js  — Vercel Serverless Function
// FMPへのリクエストをサーバーサイドで中継（CORS回避 + APIキー隠蔽）

export default async function handler(req, res) {
  // CORS headers（ブラウザからのアクセスを許可）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const path = req.query?.path;
    if (!path) {
      return res.status(400).json({ error: 'path query parameter is required' });
    }

    const apiKey = process.env.FMP_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'FMP_API_KEY is not set in Vercel environment variables' });
    }

    // pathにはエンドポイント以降（例: /company-screener?exchange=NASDAQ&limit=30）
    const separator = path.includes('?') ? '&' : '?';
    const url = `https://financialmodelingprep.com/stable${path}${separator}apikey=${apiKey}`;

    const fmpRes = await fetch(url);
    const text = await fmpRes.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // FMPがJSON以外を返した場合（HTMLエラーページなど）
      return res.status(502).json({
        error: 'FMP returned non-JSON response',
        fmpStatus: fmpRes.status,
        snippet: text.slice(0, 300),
      });
    }

    if (!fmpRes.ok) {
      return res.status(fmpRes.status).json({
        error: 'FMP API error',
        fmpStatus: fmpRes.status,
        detail: data,
      });
    }

    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({
      error: 'Internal server error',
      message: e?.message ?? String(e),
      stack: e?.stack?.split('\n').slice(0, 5),
    });
  }
}
