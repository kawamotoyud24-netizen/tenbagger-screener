// api/fmp.js  — Vercel Serverless Function
// FMPへのリクエストをサーバーサイドで中継（CORS回避 + APIキー隠蔽）

export default async function handler(req, res) {
  // CORS headers（ブラウザからのアクセスを許可）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { path } = req.query;
  if (!path) return res.status(400).json({ error: 'path is required' });

  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'FMP_API_KEY not set' });

  // pathにはエンドポイント以降（例: /company-screener?exchange=NASDAQ&limit=30）
  const url = `https://financialmodelingprep.com/stable${path}&apikey=${apiKey}`;

  try {
    const fmpRes = await fetch(url);
    const data = await fmpRes.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
