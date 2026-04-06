/**
 * XIRR: Extended Internal Rate of Return
 * Computes the annualized return for a series of cash flows at irregular dates.
 * This is the same algorithm used by Excel and Google Sheets.
 *
 * @param cashFlows - Array of {date, amount}. Investments are NEGATIVE, receipts POSITIVE.
 * @returns APY as a percentage (e.g. 12.5 means 12.5%) or null if it cannot converge.
 */
export function xirr(cashFlows: { date: Date; amount: number }[]): number | null {
  if (cashFlows.length < 2) return null;

  const sorted = [...cashFlows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const t0 = sorted[0].date.getTime();
  const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;
  const yrs = sorted.map((cf) => (cf.date.getTime() - t0) / MS_PER_YEAR);

  const npv = (r: number): number =>
    sorted.reduce((sum, cf, i) => sum + cf.amount / Math.pow(1 + r, yrs[i]), 0);

  const dnpv = (r: number): number =>
    sorted.reduce(
      (sum, cf, i) => sum - yrs[i] * cf.amount / Math.pow(1 + r, yrs[i] + 1),
      0
    );

  let rate = 0.1;
  for (let iter = 0; iter < 300; iter++) {
    const f = npv(rate);
    const df = dnpv(rate);
    if (Math.abs(df) < 1e-12) break;
    const delta = f / df;
    rate -= delta;
    if (rate < -0.9999) rate = -0.9999;
    if (Math.abs(delta) < 1e-9) {
      if (Math.abs(npv(rate)) < 0.01) return rate * 100;
      break;
    }
  }

  return null;
}
