export interface StockTickerResult {
  ticker: string;
  stockPrice: number;
  stockCurrency: string;
  fxRate: number;
  targetCurrency: string;
  shares: number;
  averagePrice: number | null;
  valueInStockCurrency: number;
  valueInTargetCurrency: number;
  costBasisStockCurrency: number | null;
  costBasisTargetCurrency: number | null;
  gainLoss: number | null;
  gainLossPercent: number | null;
  fxImpact: number | null;
  fxImpactPercent: number | null;
  totalReturn: number | null;
  totalReturnPercent: number | null;
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
  averagePrice?: number | null,
  investedEur?: number | null,
): Promise<StockTickerResult> {
  console.log(`[StockTicker] Fetching price for ${ticker}...`);
  const { price, currency: stockCurrency } = await fetchStockPrice(ticker);
  console.log(`[StockTicker] ${ticker} price: ${price} ${stockCurrency}`);

  const fxRate = await fetchFxRate(stockCurrency, targetCurrency);
  console.log(`[StockTicker] FX rate ${stockCurrency}/${targetCurrency}: ${fxRate}`);

  const valueInStockCurrency = shares * price;
  const valueInTargetCurrency = valueInStockCurrency * fxRate;

  let costBasisStockCurrency: number | null = null;
  let costBasisTargetCurrency: number | null = null;
  let gainLoss: number | null = null;
  let gainLossPercent: number | null = null;
  let fxImpact: number | null = null;
  let fxImpactPercent: number | null = null;
  let totalReturn: number | null = null;
  let totalReturnPercent: number | null = null;

  if (averagePrice != null && averagePrice > 0) {
    costBasisStockCurrency = shares * averagePrice;

    gainLoss = (price - averagePrice) * shares * fxRate;
    gainLossPercent = ((price - averagePrice) / averagePrice) * 100;

    if (investedEur != null && investedEur > 0) {
      costBasisTargetCurrency = investedEur;
      totalReturn = valueInTargetCurrency - investedEur;
      totalReturnPercent = (totalReturn / investedEur) * 100;
      fxImpact = totalReturn - gainLoss;
      fxImpactPercent = (fxImpact / investedEur) * 100;
    } else {
      costBasisTargetCurrency = costBasisStockCurrency * fxRate;
      totalReturn = valueInTargetCurrency - costBasisTargetCurrency;
      totalReturnPercent = costBasisTargetCurrency > 0 ? (totalReturn / costBasisTargetCurrency) * 100 : null;
      fxImpact = null;
      fxImpactPercent = null;
    }
  }

  console.log(`[StockTicker] ${shares} shares × ${price} ${stockCurrency} = ${valueInStockCurrency.toFixed(2)} ${stockCurrency} = ${valueInTargetCurrency.toFixed(2)} ${targetCurrency}`);
  if (gainLoss != null) {
    console.log(`[StockTicker] Gain/Loss: ${gainLoss.toFixed(2)} ${targetCurrency} (${gainLossPercent?.toFixed(2)}%), FX Impact: ${fxImpact?.toFixed(2) ?? 'N/A'} ${targetCurrency}, Total Return: ${totalReturn?.toFixed(2)} ${targetCurrency} (${totalReturnPercent?.toFixed(2)}%)`);
  }

  return {
    ticker,
    stockPrice: price,
    stockCurrency,
    fxRate,
    targetCurrency,
    shares,
    averagePrice: averagePrice ?? null,
    valueInStockCurrency,
    valueInTargetCurrency,
    costBasisStockCurrency,
    costBasisTargetCurrency,
    gainLoss,
    gainLossPercent,
    fxImpact,
    fxImpactPercent,
    totalReturn,
    totalReturnPercent,
    scrapedAt: new Date(),
  };
}
