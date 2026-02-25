export interface StockTickerResult {
  ticker: string;
  stockPrice: number;
  stockCurrency: string;
  fxRate: number;
  targetCurrency: string;
  shares: number;
  valueInStockCurrency: number;
  valueInTargetCurrency: number;
  scrapedAt: Date;
}

async function fetchStockPrice(ticker: string): Promise<{ price: number; currency: string }> {
  const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;

  const response = await fetch(yfUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Yahoo Finance returned ${response.status} for ${ticker}`);
  }

  const data = await response.json() as any;
  const chart = data?.chart?.result?.[0];
  if (!chart) {
    throw new Error(`No chart data found for ticker ${ticker}`);
  }

  const price = chart.meta?.regularMarketPrice;
  const currency = chart.meta?.currency || "USD";

  if (price == null || isNaN(price)) {
    throw new Error(`No valid price found for ticker ${ticker}`);
  }

  return { price, currency };
}

async function fetchFxRate(from: string, to: string): Promise<number> {
  if (from.toUpperCase() === to.toUpperCase()) return 1;

  const url = `https://api.frankfurter.app/latest?from=${from.toUpperCase()}&to=${to.toUpperCase()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`FX rate fetch failed: ${response.status}`);
  }

  const data = await response.json() as any;
  const rate = data?.rates?.[to.toUpperCase()];

  if (rate == null || isNaN(rate)) {
    throw new Error(`No FX rate found for ${from} -> ${to}`);
  }

  return rate;
}

export async function scrapeStockTicker(
  ticker: string,
  shares: number,
  targetCurrency: string,
): Promise<StockTickerResult> {
  console.log(`[StockTicker] Fetching price for ${ticker}...`);
  const { price, currency: stockCurrency } = await fetchStockPrice(ticker);
  console.log(`[StockTicker] ${ticker} price: ${price} ${stockCurrency}`);

  const fxRate = await fetchFxRate(stockCurrency, targetCurrency);
  console.log(`[StockTicker] FX rate ${stockCurrency}/${targetCurrency}: ${fxRate}`);

  const valueInStockCurrency = shares * price;
  const valueInTargetCurrency = valueInStockCurrency * fxRate;

  console.log(`[StockTicker] ${shares} shares × ${price} ${stockCurrency} = ${valueInStockCurrency.toFixed(2)} ${stockCurrency} = ${valueInTargetCurrency.toFixed(2)} ${targetCurrency}`);

  return {
    ticker,
    stockPrice: price,
    stockCurrency,
    fxRate,
    targetCurrency,
    shares,
    valueInStockCurrency,
    valueInTargetCurrency,
    scrapedAt: new Date(),
  };
}
