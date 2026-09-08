// Live quotes from Finnhub (https://finnhub.io) — free tier, 60 req/min,
// no credit card. Needs a free API key in FINNHUB_API_KEY; without one this
// module is simply not called (see requireStocksConfigured in index.js).

const FINNHUB_BASE = 'https://finnhub.io/api/v1/quote';

async function getStockQuotes(symbols, apiKey) {
  const clean = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if (!clean.length) return [];

  const results = await Promise.all(
    clean.map(async (symbol) => {
      try {
        const url = `${FINNHUB_BASE}?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
        const resp = await fetch(url);
        if (!resp.ok) return { symbol, price: null, changePercent: null };
        const data = await resp.json();
        // Finnhub returns all-zero fields for a symbol it doesn't recognize
        // rather than an HTTP error, so treat c === 0 as "no data".
        const hasPrice = typeof data.c === 'number' && data.c > 0;
        return {
          symbol,
          price: hasPrice ? data.c : null,
          changePercent: hasPrice && typeof data.dp === 'number' ? data.dp : null,
        };
      } catch (err) {
        return { symbol, price: null, changePercent: null };
      }
    })
  );

  return results;
}

export { getStockQuotes };
