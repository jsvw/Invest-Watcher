import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download } from "lucide-react";
import { useAuth } from "@/App";
import { formatCurrency } from "@/lib/currency";
import { useToast } from "@/hooks/use-toast";
import { xirr } from "@/lib/xirr";

// ── API response types ──────────────────────────────────────────────────────

interface Platform {
  id: number;
  name: string;
  category: string;
  currency: string;
  targetAllocation: string | null;
  color: string;
  icon: string | null;
}

interface PlatformBreakdown {
  platformId: number;
  name: string;
  netInvested: number;
  valueChange: number;
}

interface WaterfallPeriod {
  period: string;
  openValue: number;
  closeValue: number;
  netInvested: number;
  valueChange: number;
  isLive?: boolean;
  platformBreakdown?: PlatformBreakdown[];
}

interface PlatformMom {
  platformId: number;
  name: string;
  currentValue: number;
  momChange: number;
  momGrowthPercent: number;
}

interface RollingEntry {
  platformId: number;
  name: string;
  change: number;
  pct: number;
  stale?: boolean;
}

interface RollingReturns {
  d7: RollingEntry[];
  d30: RollingEntry[];
  d90: RollingEntry[];
}

interface CashflowData {
  investments: { platformId: number; amount: number; date: string }[];
  withdrawals: { platformId: number; amount: number; date: string }[];
}

interface HistoryPoint {
  date: string;
  value: number;
  invested: number;
}

interface T212Instrument {
  ticker: string;
  shares: number | null;
  currentPrice: number | null;
  averagePrice: number | null;
  ppl: number | null;
  currentShare: number | null;
}

interface T212Holdings {
  instruments: T212Instrument[];
  currentValue: number;
  result: number;
  dividendsGained: number;
  fromDb?: boolean;
}

interface DivPayment {
  ticker: string;
  amount: number;
  paidOn: string;
}

interface DivProjection {
  ticker: string;
  amount: number;
  date: string;
  frequency: string;
  source: "declared" | "estimated";
}

interface DividendCalendar {
  payments: DivPayment[];
  projections: DivProjection[];
}

interface AssetSummary {
  id: number;
  platformId: number;
  name: string;
  status: string;
  investedAmount: number;
  exitPrice: number | null;
  exitDate: string | null;
  acquisitionDate: string | null;
  currentValue: number;
  profitLoss: number;
}

interface InsightResponse {
  insight?: string;
}

// ── Types ────────────────────────────────────────────────────────────────────

type PeriodType = "month" | "quarter" | "year";
type RGB = [number, number, number];

interface ExportReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ── Chapter registry ──────────────────────────────────────────────────────────

type SectionId =
  | "executive"
  | "performance"
  | "cashflow"
  | "allocation"
  | "holdings"
  | "risk"
  | "dividends"
  | "rebalancing"
  | "tax"
  | "ai";

interface SectionDef {
  id: SectionId;
  label: string;
  availableFor: PeriodType[];
}

const SECTION_REGISTRY: SectionDef[] = [
  { id: "executive",   label: "Executive Summary",       availableFor: ["month", "quarter", "year"] },
  { id: "performance", label: "Performance & Growth",    availableFor: ["month", "quarter", "year"] },
  { id: "cashflow",    label: "Cashflow",                availableFor: ["month", "quarter", "year"] },
  { id: "allocation",  label: "Allocation",              availableFor: ["month", "quarter", "year"] },
  { id: "holdings",   label: "Holdings & Position Changes", availableFor: ["month", "quarter", "year"] },
  { id: "risk",        label: "Risk & Stability",        availableFor: ["quarter", "year"] },
  { id: "dividends",   label: "Dividend Report",         availableFor: ["quarter", "year"] },
  { id: "rebalancing", label: "Rebalancing Plan",        availableFor: ["quarter", "year"] },
  { id: "tax",         label: "Tax Summary",             availableFor: ["year"] },
  { id: "ai",          label: "AI Insights",             availableFor: ["month", "quarter", "year"] },
];

const LS_KEY = "exportReportSections";

function loadSavedSections(periodType: PeriodType): Set<SectionId> | null {
  try {
    const raw = localStorage.getItem(`${LS_KEY}:${periodType}`);
    if (raw !== null) {
      const ids = JSON.parse(raw) as SectionId[];
      const valid = SECTION_REGISTRY.filter(s => s.availableFor.includes(periodType)).map(s => s.id);
      return new Set(ids.filter((id): id is SectionId => valid.includes(id)));
    }
  } catch {
    // ignore
  }
  return null;
}

function defaultSections(periodType: PeriodType): Set<SectionId> {
  return new Set(SECTION_REGISTRY.filter(s => s.availableFor.includes(periodType)).map(s => s.id));
}

function saveSections(periodType: PeriodType, sections: Set<SectionId>) {
  try {
    localStorage.setItem(`${LS_KEY}:${periodType}`, JSON.stringify([...sections]));
  } catch {
    // ignore
  }
}

// ── Period helpers ────────────────────────────────────────────────────────────

function getPeriodBounds(periodType: PeriodType, selectedYear: string, selectedMonth: string, selectedQuarter: string): { start: Date; end: Date } {
  const y = Number(selectedYear);
  if (periodType === "year") {
    return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59) };
  }
  if (periodType === "quarter") {
    const q = Number(selectedQuarter);
    const startMonth = (q - 1) * 3;
    const endMonth = q * 3;
    return { start: new Date(y, startMonth, 1), end: new Date(y, endMonth, 0, 23, 59, 59) };
  }
  const m = Number(selectedMonth) - 1;
  return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0, 23, 59, 59) };
}

function isInPeriod(dateStr: string, start: Date, end: Date): boolean {
  const d = new Date(dateStr);
  return d >= start && d <= end;
}

// ── Statistical helpers ───────────────────────────────────────────────────────

function computeVolatility(historyPoints: HistoryPoint[]): number | null {
  if (historyPoints.length < 3) return null;
  const sorted = [...historyPoints].sort((a, b) => a.date.localeCompare(b.date));
  const returns: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].value;
    const curr = sorted[i].value;
    if (prev > 0) returns.push((curr - prev) / prev);
  }
  if (returns.length < 2) return null;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const periodDays = returns.length > 0
    ? (new Date(sorted[sorted.length - 1].date).getTime() - new Date(sorted[0].date).getTime()) / (returns.length * 86400000)
    : 30;
  const annualisationFactor = Math.sqrt(365 / Math.max(periodDays, 1));
  return Math.sqrt(variance) * annualisationFactor * 100;
}

function computeMaxDrawdown(historyPoints: HistoryPoint[]): number | null {
  if (historyPoints.length < 2) return null;
  const sorted = [...historyPoints].sort((a, b) => a.date.localeCompare(b.date));
  let peak = sorted[0].value;
  let maxDd = 0;
  for (const pt of sorted) {
    if (pt.value > peak) peak = pt.value;
    const dd = peak > 0 ? (peak - pt.value) / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd * 100;
}

function computeTwr(historyRows: WaterfallPeriod[]): number | null {
  if (historyRows.length === 0) return null;
  let twr = 1;
  for (const row of historyRows) {
    const adjustedOpen = row.openValue + Math.max(0, row.netInvested);
    if (adjustedOpen > 0) {
      twr *= (row.closeValue / adjustedOpen);
    }
  }
  return (twr - 1) * 100;
}

// ── Component ───────────────────────────────────────────────────────────────

export function ExportReportDialog({ open, onOpenChange, currency }: ExportReportDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const now = new Date();

  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1));
  const [selectedQuarter, setSelectedQuarter] = useState("1");
  const [generating, setGenerating] = useState(false);
  const [selectedSections, setSelectedSections] = useState<Set<SectionId>>(() => loadSavedSections("month") ?? defaultSections("month"));

  // ── Period discovery (data-aware selectors) ───────────────────────────────
  const [periodsLoading, setPeriodsLoading] = useState(false);
  const [discoveryError, setDiscoveryError] = useState(false);
  // year → Set of "MM" strings that have data
  const [dataMonths, setDataMonths] = useState<Map<string, Set<string>>>(new Map());

  // Derived from dataMonths
  const availableYears = [...dataMonths.keys()].sort().reverse();
  const availableMonths = [...(dataMonths.get(selectedYear) ?? [])].sort();
  const availableQuarters = [...new Set(
    [...(dataMonths.get(selectedYear) ?? [])].map(m => String(Math.ceil(Number(m) / 3)))
  )].sort();

  function runDiscovery() {
    setPeriodsLoading(true);
    setDiscoveryError(false);
    fetch("/api/portfolio/waterfall?granularity=month", { credentials: "include" })
      .then(r => {
        if (!r.ok) throw new Error("fetch failed");
        return r.json() as Promise<WaterfallPeriod[]>;
      })
      .then(periods => {
        const map = new Map<string, Set<string>>();
        for (const p of periods) {
          const m = p.period.match(/^(\d{4})-(\d{2})$/);
          if (m) {
            const [, yr, mo] = m;
            if (!map.has(yr)) map.set(yr, new Set());
            map.get(yr)!.add(mo);
          }
        }
        setDataMonths(map);

        // Only snap selection when the current selection is not valid in the new data
        if (map.size > 0) {
          const latestYear = [...map.keys()].sort().reverse()[0];
          const yearToUse = map.has(selectedYear) ? selectedYear : latestYear;
          const monthsForYear = [...map.get(yearToUse)!].sort().reverse();
          const latestMonth = monthsForYear[0];
          const latestQuarter = String(Math.ceil(Number(latestMonth) / 3));
          const currentMonthPadded = selectedMonth.padStart(2, "0");
          const currentQuarterValid = monthsForYear.some(
            m2 => String(Math.ceil(Number(m2) / 3)) === selectedQuarter
          );
          if (!map.has(selectedYear)) setSelectedYear(yearToUse);
          if (!monthsForYear.includes(currentMonthPadded)) setSelectedMonth(String(Number(latestMonth)));
          if (!currentQuarterValid) setSelectedQuarter(latestQuarter);
        }
      })
      .catch(() => setDiscoveryError(true))
      .finally(() => setPeriodsLoading(false));
  }

  // Fetch available periods when dialog opens
  useEffect(() => {
    if (!open) return;
    runDiscovery();
  }, [open]);

  // When year changes, snap month/quarter to a valid value for that year
  useEffect(() => {
    const months = [...(dataMonths.get(selectedYear) ?? [])].sort().reverse();
    if (months.length === 0) return;
    const quarters = [...new Set(months.map(m => String(Math.ceil(Number(m) / 3))))].sort().reverse();
    if (!months.includes(selectedMonth.padStart(2, "0"))) {
      setSelectedMonth(String(Number(months[0])));
    }
    if (!quarters.includes(selectedQuarter)) {
      setSelectedQuarter(quarters[0]);
    }
  }, [selectedYear, dataMonths]);

  useEffect(() => {
    // Load saved selections for the new period type; fall back to all-available
    // only when no saved value exists (null), preserving empty selections intentionally saved.
    const saved = loadSavedSections(periodType);
    setSelectedSections(saved ?? defaultSections(periodType));
  }, [periodType]);

  function toggleSection(id: SectionId) {
    setSelectedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveSections(periodType, next);
      return next;
    });
  }

  function selectAll() {
    const next = new Set(SECTION_REGISTRY.filter(s => s.availableFor.includes(periodType)).map(s => s.id));
    setSelectedSections(next);
    saveSections(periodType, next);
  }

  function clearAll() {
    const next = new Set<SectionId>();
    setSelectedSections(next);
    saveSections(periodType, next);
  }

  const sec = (id: SectionId) => selectedSections.has(id);

  function getPeriodLabel(): string {
    if (periodType === "year") return selectedYear;
    if (periodType === "quarter") return `Q${selectedQuarter} ${selectedYear}`;
    return `${MONTH_NAMES[Number(selectedMonth) - 1]} ${selectedYear}`;
  }

  function getWaterfallKey(): string {
    if (periodType === "year") return selectedYear;
    if (periodType === "quarter") return `${selectedYear}-Q${selectedQuarter}`;
    return `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;
  }

  function getPeriodHistoryRows(allPeriods: WaterfallPeriod[]): WaterfallPeriod[] {
    if (periodType === "year") {
      return [...allPeriods]
        .filter(p => /^\d{4}$/.test(p.period) && p.period <= selectedYear)
        .sort((a, b) => a.period.localeCompare(b.period));
    }
    if (periodType === "quarter") {
      return [...allPeriods]
        .filter(p => p.period.startsWith(selectedYear + "-Q"))
        .sort((a, b) => a.period.localeCompare(b.period));
    }
    return [...allPeriods]
      .filter(p => p.period.startsWith(selectedYear + "-") && !p.period.includes("Q"))
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  function formatPeriodLabel(period: string): string {
    if (/^\d{4}$/.test(period)) return period;
    const qMatch = period.match(/^(\d{4})-Q(\d)$/);
    if (qMatch) return `Q${qMatch[2]} ${qMatch[1]}`;
    const mMatch = period.match(/^(\d{4})-(\d{2})$/);
    if (mMatch) {
      const mIdx = parseInt(mMatch[2], 10) - 1;
      return `${MONTH_NAMES[mIdx]?.slice(0, 3) ?? mMatch[2]} ${mMatch[1]}`;
    }
    return period;
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const periodLabel = getPeriodLabel();
      const waterfallKey = getWaterfallKey();
      const { start: periodStart, end: periodEnd } = getPeriodBounds(periodType, selectedYear, selectedMonth, selectedQuarter);

      // ── Fetch core data in parallel ──────────────────────────────────────
      const isQuarterlyOrYearly = periodType === "quarter" || periodType === "year";

      const [
        platforms,
        momData,
        rollingData,
        waterfallData,
        cashflowData,
        historyData,
        allAssets,
      ] = await Promise.all([
        fetch("/api/platforms", { credentials: "include" }).then(r => r.ok ? r.json() as Promise<Platform[]> : Promise.resolve([] as Platform[])),
        fetch("/api/portfolio/platform-mom", { credentials: "include" }).then(r => r.ok ? r.json() as Promise<PlatformMom[]> : Promise.resolve([] as PlatformMom[])),
        fetch("/api/portfolio/platform-rolling-returns", { credentials: "include" }).then(r => r.ok ? r.json() as Promise<RollingReturns> : Promise.resolve(null as RollingReturns | null)),
        fetch(`/api/portfolio/waterfall?granularity=${periodType}`, { credentials: "include" }).then(r => r.ok ? r.json() as Promise<WaterfallPeriod[]> : Promise.resolve([] as WaterfallPeriod[])),
        fetch("/api/portfolio/cashflow-data", { credentials: "include" }).then(r => r.ok ? r.json() as Promise<CashflowData> : Promise.resolve({ investments: [], withdrawals: [] } as CashflowData)),
        fetch(`/api/portfolio/history?range=year-${selectedYear}`, { credentials: "include" }).then(r => r.ok ? r.json() as Promise<HistoryPoint[]> : Promise.resolve([] as HistoryPoint[])),
        fetch("/api/portfolio/all-assets", { credentials: "include" }).then(r => r.ok ? r.json() as Promise<AssetSummary[]> : Promise.resolve([] as AssetSummary[])),
      ]);

      const periodEntry = waterfallData.find(p => p.period === waterfallKey) ?? null;
      const historyRows = getPeriodHistoryRows(waterfallData);

      if (!periodEntry && historyRows.length === 0) {
        toast({
          title: "No data for this period",
          description: `No portfolio records were found for ${getPeriodLabel()}. Try selecting a different period.`,
          variant: "destructive",
        });
        setGenerating(false);
        return;
      }

      // ── Fetch T212 holdings + dividend calendar for all platforms ────────
      // Fetches run independently — dividend calendar does NOT require successful holdings fetch
      const t212HoldingsMap = new Map<number, T212Holdings>();
      const dividendCalendarMap = new Map<number, DividendCalendar>();

      if (platforms.length > 0) {
        const t212Fetches = platforms.map(async (p) => {
          await Promise.all([
            // Holdings (for ticker-level Holdings Summary)
            fetch(`/api/platforms/${p.id}/trading212-holdings`, { credentials: "include" })
              .then(async r => { if (r.ok) t212HoldingsMap.set(p.id, await r.json() as T212Holdings); })
              .catch(() => {}),
            // Dividend calendar (for Cashflow dividends and Dividend Report sections)
            fetch(`/api/platforms/${p.id}/dividend-calendar`, { credentials: "include" })
              .then(async r => { if (r.ok) dividendCalendarMap.set(p.id, await r.json() as DividendCalendar); })
              .catch(() => {}),
          ]);
        });
        await Promise.all(t212Fetches);
      }

      // ── Cashflow calculations ─────────────────────────────────────────────
      const periodInvestments = cashflowData.investments.filter(inv => isInPeriod(inv.date, periodStart, periodEnd));
      const periodWithdrawals = cashflowData.withdrawals.filter(wd => isInPeriod(wd.date, periodStart, periodEnd));
      const totalDeposits = periodInvestments.reduce((s, i) => s + i.amount, 0);
      const totalWithdrawals = periodWithdrawals.reduce((s, w) => s + w.amount, 0);

      // T212 dividends for the period (from all dividend calendars)
      let periodDividends = 0;
      const dividendsByTicker = new Map<string, number>();
      for (const [, calendar] of dividendCalendarMap) {
        for (const payment of calendar.payments) {
          if (isInPeriod(payment.paidOn, periodStart, periodEnd)) {
            periodDividends += payment.amount;
            dividendsByTicker.set(payment.ticker, (dividendsByTicker.get(payment.ticker) ?? 0) + payment.amount);
          }
        }
      }
      const netCashflow = totalDeposits - totalWithdrawals + periodDividends;

      // Prior period cashflow comparison — exact equivalent period boundaries
      const yr = Number(selectedYear);
      let prevStart: Date;
      let prevEnd: Date;
      if (periodType === "month") {
        const m = Number(selectedMonth) - 1; // 0-indexed current month
        prevStart = new Date(yr, m - 1, 1);        // 1st of previous month
        prevEnd = new Date(yr, m, 0, 23, 59, 59); // last day of previous month
      } else if (periodType === "quarter") {
        const q = Number(selectedQuarter) - 1; // 0-indexed current quarter
        if (q === 0) {
          // Q1 → prior period is Q4 of previous year
          prevStart = new Date(yr - 1, 9, 1);      // Oct 1 of previous year
          prevEnd = new Date(yr - 1, 12, 0, 23, 59, 59); // Dec 31 of previous year
        } else {
          const startMonth = (q - 1) * 3; // previous quarter start month
          prevStart = new Date(yr, startMonth, 1);
          prevEnd = new Date(yr, startMonth + 3, 0, 23, 59, 59);
        }
      } else {
        prevStart = new Date(yr - 1, 0, 1);         // Jan 1 of previous year
        prevEnd = new Date(yr - 1, 11, 31, 23, 59, 59); // Dec 31 of previous year
      }
      const prevDeposits = cashflowData.investments.filter(i => isInPeriod(i.date, prevStart, prevEnd)).reduce((s, i) => s + i.amount, 0);
      const prevWithdrawals = cashflowData.withdrawals.filter(w => isInPeriod(w.date, prevStart, prevEnd)).reduce((s, w) => s + w.amount, 0);
      let prevDividends = 0;
      for (const [, calendar] of dividendCalendarMap) {
        for (const payment of calendar.payments) {
          if (isInPeriod(payment.paidOn, prevStart, prevEnd)) prevDividends += payment.amount;
        }
      }
      const prevNetCashflow = prevDeposits - prevWithdrawals + prevDividends;

      // ── XIRR calculation ─────────────────────────────────────────────────
      // Opening portfolio value is the initial outflow at period start;
      // deposits are additional outflows; withdrawals are inflows;
      // closing portfolio value is the final inflow.
      let xirrResult: number | null = null;
      if (periodEntry && periodEntry.openValue > 0) {
        const xirrFlows: { date: Date; amount: number }[] = [
          { date: periodStart, amount: -periodEntry.openValue },
        ];
        for (const inv of cashflowData.investments) {
          if (isInPeriod(inv.date, periodStart, periodEnd)) {
            xirrFlows.push({ date: new Date(inv.date), amount: -inv.amount });
          }
        }
        for (const wd of cashflowData.withdrawals) {
          if (isInPeriod(wd.date, periodStart, periodEnd)) {
            xirrFlows.push({ date: new Date(wd.date), amount: wd.amount });
          }
        }
        xirrFlows.push({ date: periodEnd, amount: periodEntry.closeValue });
        if (xirrFlows.length >= 2) {
          xirrResult = xirr(xirrFlows);
        }
      }

      // ── Performance metrics ───────────────────────────────────────────────
      const periodReturn = periodEntry && periodEntry.openValue > 0
        ? (periodEntry.valueChange / periodEntry.openValue) * 100
        : null;

      // YTD return (for monthly/quarterly): sum value changes across all periods this year up to selected
      let ytdReturn: number | null = null;
      if (periodType !== "year") {
        const yearKey = selectedYear;
        const ytdPeriods = waterfallData.filter(p => {
          if (periodType === "quarter") return p.period.startsWith(yearKey + "-Q") && p.period <= waterfallKey;
          return p.period.startsWith(yearKey + "-") && !p.period.includes("Q") && p.period <= waterfallKey;
        });
        if (ytdPeriods.length > 0) {
          const ytdStart = ytdPeriods[0].openValue;
          const ytdEnd = ytdPeriods[ytdPeriods.length - 1].closeValue;
          const ytdNetInvested = ytdPeriods.reduce((s, p) => s + p.netInvested, 0);
          if (ytdStart + Math.max(0, ytdNetInvested) > 0) {
            ytdReturn = ((ytdEnd - ytdStart - ytdNetInvested) / (ytdStart + Math.max(0, ytdNetInvested))) * 100;
          }
        }
      }

      // Since-inception: first waterfall row to last
      const allWaterfallSorted = [...waterfallData]
        .filter(p => {
          if (periodType === "year") return /^\d{4}$/.test(p.period);
          if (periodType === "quarter") return /\d{4}-Q\d/.test(p.period);
          return /\d{4}-\d{2}$/.test(p.period);
        })
        .sort((a, b) => a.period.localeCompare(b.period));
      let sinceInceptionReturn: number | null = null;
      if (allWaterfallSorted.length > 0) {
        const firstPeriod = allWaterfallSorted[0];
        const lastPeriod = allWaterfallSorted[allWaterfallSorted.length - 1];
        const totalNetInv = allWaterfallSorted.reduce((s, p) => s + p.netInvested, 0);
        if (firstPeriod.openValue + Math.max(0, totalNetInv) > 0) {
          sinceInceptionReturn = ((lastPeriod.closeValue - firstPeriod.openValue - totalNetInv) / (firstPeriod.openValue + Math.max(0, totalNetInv))) * 100;
        }
      }

      // TWR
      const twrResult = computeTwr(historyRows);

      // ── Allocation data ───────────────────────────────────────────────────
      const totalPortfolioValue = momData.reduce((s, p) => s + p.currentValue, 0);
      const platformValueMap = new Map<number, number>();
      for (const p of momData) platformValueMap.set(p.platformId, p.currentValue);

      // By category
      const byCategory = new Map<string, number>();
      for (const p of platforms) {
        const val = platformValueMap.get(p.id) ?? 0;
        byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + val);
      }

      // By currency
      const byCurrency = new Map<string, number>();
      for (const p of platforms) {
        const val = platformValueMap.get(p.id) ?? 0;
        byCurrency.set(p.currency, (byCurrency.get(p.currency) ?? 0) + val);
      }

      // Drift vs target
      const driftRows = platforms
        .map(p => {
          const currentVal = platformValueMap.get(p.id) ?? 0;
          const actualWeight = totalPortfolioValue > 0 ? (currentVal / totalPortfolioValue) * 100 : 0;
          const targetWeight = p.targetAllocation ? Number(p.targetAllocation) : null;
          const delta = targetWeight !== null ? actualWeight - targetWeight : null;
          return { name: p.name, currentVal, actualWeight, targetWeight, delta };
        })
        .filter(r => r.currentVal > 0 || r.targetWeight !== null)
        .sort((a, b) => b.currentVal - a.currentVal);

      // ── Holdings summary ──────────────────────────────────────────────────
      const holdingsSummary = platforms
        .map(p => {
          const val = platformValueMap.get(p.id) ?? 0;
          const weight = totalPortfolioValue > 0 ? (val / totalPortfolioValue) * 100 : 0;
          const breakdown = periodEntry?.platformBreakdown?.find(pb => pb.platformId === p.id);
          const gainLoss = breakdown?.valueChange ?? 0;
          // Platform open value = closing value minus gain; use as denominator for return %
          const platformOpenValue = val - gainLoss;
          const gainLossPct = breakdown && platformOpenValue > 0
            ? (gainLoss / platformOpenValue) * 100
            : 0;
          return { platformId: p.id, name: p.name, val, weight, gainLoss, gainLossPct };
        })
        .filter(r => r.val > 0)
        .sort((a, b) => b.val - a.val);

      // ── Risk metrics (quarterly/yearly) ───────────────────────────────────
      const periodHistoryPoints = historyData.filter(h => isInPeriod(h.date, periodStart, periodEnd));
      const annualisedVol = computeVolatility(periodHistoryPoints);
      const maxDrawdown = computeMaxDrawdown(periodHistoryPoints);
      const concentrationPlatform = holdingsSummary.length > 0 ? holdingsSummary[0] : null;

      // ── Tax summary (yearly) ──────────────────────────────────────────────
      const realisedGains = allAssets.filter(a =>
        a.status === "exited" && a.exitDate && isInPeriod(a.exitDate, periodStart, periodEnd)
      );
      const unrealisedPositions = allAssets.filter(a => a.status === "active");

      // ── Rebalancing plan ─────────────────────────────────────────────────
      const rebalancingRows = driftRows
        .filter(r => r.targetWeight !== null)
        .map(r => ({
          ...r,
          action: r.delta! > 5 ? "Overweight" : r.delta! < -5 ? "Underweight" : "On Target",
        }))
        .sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!));

      // ── Concentration warnings ────────────────────────────────────────────
      const concentrationWarnings = holdingsSummary.filter(h => h.weight > 30);

      // ── Best / worst performers — by period return % ─────────────────────
      const performersSorted = [...holdingsSummary].filter(h => h.val > 0);
      const bestPlatform = performersSorted.length > 0
        ? [...performersSorted].sort((a, b) => b.gainLossPct - a.gainLossPct)[0]
        : null;
      const worstPlatform = performersSorted.length > 1
        ? [...performersSorted].sort((a, b) => a.gainLossPct - b.gainLossPct)[0]
        : null;

      // ── Dividend yield — trailing 12m from period end date ────────────────
      const trailingStart = new Date(periodEnd);
      trailingStart.setFullYear(trailingStart.getFullYear() - 1);
      let totalAnnualisedDivs = 0;
      for (const [, calendar] of dividendCalendarMap) {
        totalAnnualisedDivs += calendar.payments
          .filter(p => { const d = new Date(p.paidOn); return d >= trailingStart && d <= periodEnd; })
          .reduce((s, p) => s + p.amount, 0);
      }
      const divYield = totalPortfolioValue > 0 ? (totalAnnualisedDivs / totalPortfolioValue) * 100 : 0;

      // ── Build AI prompt ───────────────────────────────────────────────────
      const driftSummary = driftRows
        .filter(r => r.delta !== null && Math.abs(r.delta) > 5)
        .map(r => `${r.name}: actual ${r.actualWeight.toFixed(1)}% vs target ${r.targetWeight!.toFixed(1)}%`)
        .slice(0, 3)
        .join("; ");

      const aiPrompt = [
        `You are a financial analyst. Answer the following 4 questions in numbered format for a ${periodType} portfolio report covering ${periodLabel}.`,
        periodEntry ? `Portfolio data: opened at ${formatCurrency(periodEntry.openValue, currency)}, closed at ${formatCurrency(periodEntry.closeValue, currency)}, value change ${formatCurrency(periodEntry.valueChange, currency)}${periodReturn != null ? ` (${periodReturn.toFixed(2)}%)` : ""}.` : "",
        `Cashflow: deposits ${formatCurrency(totalDeposits, currency)}, withdrawals ${formatCurrency(totalWithdrawals, currency)}, dividends ${formatCurrency(periodDividends, currency)}.`,
        bestPlatform ? `Best performer: ${bestPlatform.name} returned ${bestPlatform.gainLossPct.toFixed(2)}% (${formatCurrency(bestPlatform.gainLoss, currency)}).` : "",
        driftSummary ? `Allocation drift: ${driftSummary}.` : "",
        "1. What drove portfolio performance this period?",
        "2. What changed vs the prior period?",
        "3. What are the main risk changes?",
        "4. Is rebalancing suggested and why?",
        "Keep each answer to 2-3 sentences.",
      ].filter(Boolean).join(" ");

      const insightRes = await fetch("/api/insights", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt }),
      }).catch(() => null);
      const insightData: InsightResponse | null = insightRes?.ok
        ? await insightRes.json().catch(() => null)
        : null;

      // ── PDF generation ────────────────────────────────────────────────────
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 18;
      const contentW = pageW - margin * 2;
      let y = margin;

      const fmt = (v: number) => formatCurrency(v, currency);
      const fmtPct = (v: number | null) => v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
      const fmtDelta = (v: number | null) => v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}pp`;

      // ── Table of Contents tracking ────────────────────────────────────────
      const tocEntries: { label: string; page: number }[] = [];
      const currentPageNum = () =>
        (doc.internal as unknown as { getCurrentPageInfo: () => { pageNumber: number } })
          .getCurrentPageInfo().pageNumber;
      let tocPageNum = 0;

      function checkPage(needed = 30) {
        if (y + needed > pageH - margin) {
          doc.addPage();
          y = margin;
        }
      }

      function sectionDivider(title: string) {
        doc.addPage();
        y = margin;
        tocEntries.push({ label: title, page: currentPageNum() });
        doc.setFillColor(37, 99, 235);
        doc.rect(0, 0, pageW, 14, "F");
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text(title, margin, 9);
        y = 22;
        doc.setTextColor(30, 30, 30);
      }

      function sectionTitle(title: string) {
        checkPage(20);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(37, 99, 235);
        doc.text(title, margin, y);
        y += 1;
        doc.setDrawColor(37, 99, 235);
        doc.setLineWidth(0.3);
        doc.line(margin, y + 1, pageW - margin, y + 1);
        y += 6;
        doc.setTextColor(30, 30, 30);
      }

      function kpiRow(items: { label: string; value: string; color?: RGB }[]) {
        checkPage(20);
        const colW = contentW / items.length;
        const boxH = 14;
        items.forEach((item, i) => {
          const x = margin + i * colW;
          doc.setFillColor(248, 250, 252);
          doc.rect(x + 1, y, colW - 2, boxH, "F");
          doc.setFontSize(7.5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(100, 100, 100);
          doc.text(item.label, x + colW / 2, y + 4, { align: "center" });
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          if (item.color) doc.setTextColor(...item.color);
          else doc.setTextColor(30, 30, 30);
          doc.text(item.value, x + colW / 2, y + 10, { align: "center" });
          doc.setTextColor(30, 30, 30);
        });
        y += boxH + 5;
      }

      function bodyText(text: string) {
        doc.setFontSize(9.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(55, 55, 55);
        const lines: string[] = doc.splitTextToSize(text, contentW);
        for (const line of lines) {
          checkPage(6);
          doc.text(line, margin, y);
          y += 5;
        }
      }

      // ══ HEADER PAGE ════════════════════════════════════════════════════════
      doc.setFontSize(26);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 30);
      doc.text("Portfolio Report", margin, y);
      y += 10;

      doc.setFontSize(13);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(37, 99, 235);
      doc.text(
        `${periodType === "month" ? "Monthly" : periodType === "quarter" ? "Quarterly" : "Annual"} Report — ${periodLabel}`,
        margin, y,
      );
      y += 7;

      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Generated: ${now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`, margin, y);
      y += 5;
      if (user?.email) {
        doc.text(`Account: ${user.email}`, margin, y);
        y += 5;
      }
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.line(margin, y + 2, pageW - margin, y + 2);

      // Insert TOC placeholder (page 2) — filled in after all content is generated
      doc.addPage();
      tocPageNum = currentPageNum(); // = 2

      // ══ SECTION 1: EXECUTIVE SUMMARY ═══════════════════════════════════════
      if (sec("executive")) {
      sectionDivider("Executive Summary");

      if (periodEntry) {
        kpiRow([
          { label: "Opening Value", value: fmt(periodEntry.openValue) },
          { label: "Closing Value", value: fmt(periodEntry.closeValue) },
          {
            label: "Period Return",
            value: fmtPct(periodReturn),
            color: periodReturn != null && periodReturn >= 0 ? [16, 185, 129] : [220, 38, 38],
          },
          { label: "Value Change", value: `${periodEntry.valueChange >= 0 ? "+" : ""}${fmt(periodEntry.valueChange)}` },
        ]);
      }

      if (bestPlatform || worstPlatform) {
        checkPage(30);
        autoTable(doc, {
          startY: y,
          head: [["", "Platform", "Period Return"]],
          body: [
            bestPlatform && bestPlatform !== worstPlatform ? ["Best Performer", bestPlatform.name, `${bestPlatform.gainLossPct >= 0 ? "+" : ""}${bestPlatform.gainLossPct.toFixed(2)}% (${fmt(bestPlatform.gainLoss)})`] : null,
            worstPlatform ? ["Worst Performer", worstPlatform.name, `${worstPlatform.gainLossPct >= 0 ? "+" : ""}${worstPlatform.gainLossPct.toFixed(2)}% (${fmt(worstPlatform.gainLoss)})`] : null,
          ].filter(Boolean) as string[][],
          margin: { left: margin, right: margin },
          styles: { fontSize: 9, cellPadding: 2.5 },
          headStyles: { fillColor: [37, 99, 235] as RGB, textColor: 255, fontStyle: "bold" },
          columnStyles: { 2: { halign: "right" } },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
      }

      if (concentrationWarnings.length > 0) {
        checkPage(18);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(220, 38, 38);
        doc.text("Concentration Warning:", margin, y);
        y += 5;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(55, 55, 55);
        for (const w of concentrationWarnings) {
          doc.text(`  • ${w.name} represents ${w.weight.toFixed(1)}% of portfolio (>30% threshold)`, margin, y);
          y += 5;
        }
        y += 2;
      }

      // New/closed assets during period (from allAssets, available for all report types)
      {
        const newPositions = allAssets.filter(a =>
          a.acquisitionDate && isInPeriod(a.acquisitionDate, periodStart, periodEnd)
        );
        const closedPositions = allAssets.filter(a =>
          a.exitDate && isInPeriod(a.exitDate, periodStart, periodEnd)
        );

        if (newPositions.length > 0 || closedPositions.length > 0) {
          checkPage(20);
          doc.setFontSize(9);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(30, 30, 30);
          doc.text("Position Changes this Period:", margin, y);
          y += 5;
          doc.setFont("helvetica", "normal");
          doc.setTextColor(55, 55, 55);
          for (const a of newPositions.slice(0, 5)) {
            doc.text(`  + New: ${a.name} (${fmt(a.investedAmount)})`, margin, y);
            y += 4.5;
          }
          for (const a of closedPositions.slice(0, 5)) {
            doc.text(`  - Closed: ${a.name} (exit ${fmt(a.exitPrice ?? 0)}, P/L ${fmt(a.profitLoss)})`, margin, y);
            y += 4.5;
          }
          y += 4;
        }
      }

      } // end executive

      // ══ SECTION 2: PERFORMANCE ══════════════════════════════════════════════
      if (sec("performance")) {
      sectionDivider("Performance");

      kpiRow([
        {
          label: "Period Return",
          value: fmtPct(periodReturn),
          color: periodReturn != null && periodReturn >= 0 ? [16, 185, 129] : [220, 38, 38],
        },
        ...(periodType !== "year" ? [{ label: "YTD Return", value: fmtPct(ytdReturn) }] : []),
        { label: "Since Inception", value: fmtPct(sinceInceptionReturn) },
        { label: "TWR", value: fmtPct(twrResult) },
        { label: "XIRR (period)", value: xirrResult != null ? `${xirrResult.toFixed(2)}%` : "—" },
      ]);

      // Growth history table
      if (historyRows.length > 0) {
        checkPage(40);
        const histLabel =
          periodType === "year" ? "Yearly Growth History"
          : periodType === "quarter" ? `Quarterly Growth — ${selectedYear}`
          : `Monthly Growth — ${selectedYear}`;
        sectionTitle(histLabel);

        autoTable(doc, {
          startY: y,
          head: [["Period", "Open", "Net Invested", "Gain / Loss", "Close", "ROI"]],
          body: historyRows.map(row => {
            const rowRoi = row.openValue > 0
              ? fmtPct((row.valueChange / row.openValue) * 100)
              : "—";
            return [
              formatPeriodLabel(row.period) + (row.isLive ? " *" : ""),
              fmt(row.openValue),
              `${row.netInvested >= 0 ? "+" : ""}${fmt(row.netInvested)}`,
              `${row.valueChange >= 0 ? "+" : ""}${fmt(row.valueChange)}`,
              fmt(row.closeValue),
              rowRoi,
            ];
          }),
          margin: { left: margin, right: margin },
          styles: { fontSize: 9, cellPadding: 2.5 },
          headStyles: { fillColor: [37, 99, 235] as RGB, textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [248, 250, 252] as RGB },
          columnStyles: {
            1: { halign: "right" }, 2: { halign: "right" },
            3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" },
          },
          didParseCell(data) {
            if (data.column.index === 3 && data.section === "body") {
              const raw = data.cell.raw as string;
              if (raw.startsWith("-")) data.cell.styles.textColor = [220, 38, 38] as RGB;
            }
          },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
        if (historyRows.some(r => r.isLive)) {
          doc.setFontSize(7.5);
          doc.setFont("helvetica", "italic");
          doc.setTextColor(130, 130, 130);
          doc.text("* Current period — data up to latest valuation date", margin, y);
          y += 6;
        } else { y += 4; }
      }

      // Platform returns table
      if ((periodEntry?.platformBreakdown?.length ?? 0) > 0) {
        checkPage(40);
        const momByName = new Map<string, PlatformMom>();
        for (const p of momData) momByName.set(p.name, p);
        const periodTypeLabel = periodType === "year" ? "YoY" : periodType === "quarter" ? "QoQ" : "MoM";
        sectionTitle(`Platform Returns — ${periodLabel} (${periodTypeLabel})`);

        autoTable(doc, {
          startY: y,
          head: [["Platform", "Current Value", "Net Invested", "Value Gain / Loss"]],
          body: [...(periodEntry!.platformBreakdown!)]
            .sort((a, b) => b.valueChange - a.valueChange)
            .map(pb => {
              const mom = momByName.get(pb.name);
              return [
                pb.name,
                mom ? fmt(mom.currentValue) : "—",
                `${pb.netInvested >= 0 ? "+" : ""}${fmt(pb.netInvested)}`,
                `${pb.valueChange >= 0 ? "+" : ""}${fmt(pb.valueChange)}`,
              ];
            }),
          margin: { left: margin, right: margin },
          styles: { fontSize: 9, cellPadding: 2.5 },
          headStyles: { fillColor: [99, 102, 241] as RGB, textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [248, 250, 252] as RGB },
          columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
          didParseCell(data) {
            if (data.column.index === 3 && data.section === "body") {
              const raw = data.cell.raw as string;
              if (raw.startsWith("-")) data.cell.styles.textColor = [220, 38, 38] as RGB;
            }
          },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      }

      } // end performance

      // ══ SECTION 3: CASHFLOW ════════════════════════════════════════════════
      if (sec("cashflow")) {
      sectionDivider("Cashflow");

      const delta = (curr: number, prev: number) => {
        if (prev === 0 && curr === 0) return "—";
        const d = curr - prev;
        return `${d >= 0 ? "+" : ""}${fmt(d)}`;
      };

      autoTable(doc, {
        startY: y,
        head: [["Item", "This Period", "Prior Period", "Change"]],
        body: [
          ["Total Deposits", fmt(totalDeposits), fmt(prevDeposits), delta(totalDeposits, prevDeposits)],
          ["Total Withdrawals", fmt(totalWithdrawals), fmt(prevWithdrawals), delta(totalWithdrawals, prevWithdrawals)],
          ["Dividends Received", fmt(periodDividends), fmt(prevDividends), delta(periodDividends, prevDividends)],
          ["Net Cashflow", fmt(netCashflow), fmt(prevNetCashflow), delta(netCashflow, prevNetCashflow)],
        ],
        margin: { left: margin, right: margin },
        styles: { fontSize: 10, cellPadding: 3 },
        headStyles: { fillColor: [16, 185, 129] as RGB, textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] as RGB },
        columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

      } // end cashflow

      // ══ SECTION 4: ALLOCATION SNAPSHOT ════════════════════════════════════
      if (sec("allocation")) {
      sectionDivider("Allocation Snapshot");

      // By category
      if (byCategory.size > 0) {
        sectionTitle("By Asset Class");
        autoTable(doc, {
          startY: y,
          head: [["Asset Class", "Value", "Portfolio Weight"]],
          body: [...byCategory.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([cat, val]) => [cat, fmt(val), totalPortfolioValue > 0 ? `${((val / totalPortfolioValue) * 100).toFixed(1)}%` : "—"]),
          margin: { left: margin, right: margin },
          styles: { fontSize: 9.5, cellPadding: 3 },
          headStyles: { fillColor: [245, 158, 11] as RGB, textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [248, 250, 252] as RGB },
          columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      }

      // By currency
      if (byCurrency.size > 0) {
        checkPage(40);
        sectionTitle("By Currency");
        autoTable(doc, {
          startY: y,
          head: [["Currency", "Value", "Portfolio Weight"]],
          body: [...byCurrency.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([cur, val]) => [cur, fmt(val), totalPortfolioValue > 0 ? `${((val / totalPortfolioValue) * 100).toFixed(1)}%` : "—"]),
          margin: { left: margin, right: margin },
          styles: { fontSize: 9.5, cellPadding: 3 },
          headStyles: { fillColor: [139, 92, 246] as RGB, textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [248, 250, 252] as RGB },
          columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      }

      // Drift vs target
      if (driftRows.some(r => r.targetWeight !== null)) {
        checkPage(40);
        sectionTitle("Drift vs Target Allocation");
        autoTable(doc, {
          startY: y,
          head: [["Platform", "Actual Weight", "Target Weight", "Delta"]],
          body: driftRows.map(r => [
            r.name,
            `${r.actualWeight.toFixed(1)}%`,
            r.targetWeight !== null ? `${r.targetWeight.toFixed(1)}%` : "—",
            r.delta !== null ? fmtDelta(r.delta) : "—",
          ]),
          margin: { left: margin, right: margin },
          styles: { fontSize: 9, cellPadding: 2.5 },
          headStyles: { fillColor: [245, 158, 11] as RGB, textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [248, 250, 252] as RGB },
          columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
          didParseCell(data) {
            if (data.column.index === 3 && data.section === "body") {
              const r = driftRows[data.row.index];
              if (r?.delta != null && Math.abs(r.delta) > 5) {
                data.cell.styles.textColor = r.delta > 0 ? [220, 38, 38] as RGB : [37, 99, 235] as RGB;
                data.cell.styles.fontStyle = "bold";
              }
            }
          },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      }

      } // end allocation

      // ══ SECTION 5: HOLDINGS SUMMARY ════════════════════════════════════════
      if (sec("holdings")) {
      sectionDivider("Holdings Summary");

      if (holdingsSummary.length > 0) {
        autoTable(doc, {
          startY: y,
          head: [["Platform", "Value", "Weight", "Period Gain/Loss €", "Period Gain/Loss %"]],
          body: holdingsSummary.map(h => [
            h.name,
            fmt(h.val),
            `${h.weight.toFixed(1)}%`,
            `${h.gainLoss >= 0 ? "+" : ""}${fmt(h.gainLoss)}`,
            `${h.gainLossPct >= 0 ? "+" : ""}${h.gainLossPct.toFixed(2)}%`,
          ]),
          margin: { left: margin, right: margin },
          styles: { fontSize: 9, cellPadding: 2.5 },
          headStyles: { fillColor: [30, 64, 175] as RGB, textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [248, 250, 252] as RGB },
          columnStyles: {
            1: { halign: "right" }, 2: { halign: "right" },
            3: { halign: "right" }, 4: { halign: "right" },
          },
          didParseCell(data) {
            if ((data.column.index === 3 || data.column.index === 4) && data.section === "body") {
              const raw = data.cell.raw as string;
              if (raw.startsWith("-")) data.cell.styles.textColor = [220, 38, 38] as RGB;
            }
          },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      }

      // Opened and closed positions this period — highlighted in Holdings Summary
      {
        const newInPeriod = allAssets.filter(a =>
          a.acquisitionDate && isInPeriod(a.acquisitionDate, periodStart, periodEnd)
        );
        const closedInPeriod = allAssets.filter(a =>
          a.exitDate && isInPeriod(a.exitDate, periodStart, periodEnd)
        );

        if (newInPeriod.length > 0 || closedInPeriod.length > 0) {
          checkPage(40);
          sectionTitle("Position Changes This Period");
          const changeRows: string[][] = [];
          for (const a of newInPeriod) {
            const pName = platforms.find(p => p.id === a.platformId)?.name ?? "";
            changeRows.push(["Opened", a.name, pName, fmt(a.investedAmount), "—"]);
          }
          for (const a of closedInPeriod) {
            const pName = platforms.find(p => p.id === a.platformId)?.name ?? "";
            const pl = `${a.profitLoss >= 0 ? "+" : ""}${fmt(a.profitLoss)}`;
            changeRows.push(["Closed", a.name, pName, fmt(a.exitPrice ?? 0), pl]);
          }
          autoTable(doc, {
            startY: y,
            head: [["Status", "Asset", "Platform", "Value", "P/L"]],
            body: changeRows,
            margin: { left: margin, right: margin },
            styles: { fontSize: 9, cellPadding: 2.5 },
            headStyles: { fillColor: [30, 64, 175] as RGB, textColor: 255, fontStyle: "bold" },
            alternateRowStyles: { fillColor: [248, 250, 252] as RGB },
            columnStyles: { 3: { halign: "right" }, 4: { halign: "right" } },
            didParseCell(data) {
              if (data.column.index === 0 && data.section === "body") {
                const status = data.cell.raw as string;
                data.cell.styles.fontStyle = "bold";
                if (status === "Opened") data.cell.styles.textColor = [16, 185, 129] as RGB;
                else if (status === "Closed") data.cell.styles.textColor = [245, 158, 11] as RGB;
              }
              if (data.column.index === 4 && data.section === "body") {
                const raw = data.cell.raw as string;
                if (raw.startsWith("-")) data.cell.styles.textColor = [220, 38, 38] as RGB;
                else if (raw.startsWith("+")) data.cell.styles.textColor = [16, 185, 129] as RGB;
              }
            },
          });
          y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
        }
      }

      // T212 ticker-level holdings (top 10 per T212 platform)
      for (const [platformId, holdings] of t212HoldingsMap) {
        const platformName = platforms.find(p => p.id === platformId)?.name ?? `Platform ${platformId}`;
        const top10 = [...holdings.instruments]
          .filter(i => i.shares && i.currentPrice)
          .map(i => ({ ...i, value: (i.shares ?? 0) * (i.currentPrice ?? 0) }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10);

        if (top10.length > 0) {
          checkPage(40);
          sectionTitle(`${platformName} — Top Holdings`);
          autoTable(doc, {
            startY: y,
            head: [["Ticker", "Shares", "Price", "Value", "P/L"]],
            body: top10.map(i => [
              i.ticker,
              (i.shares ?? 0).toFixed(4),
              fmt(i.currentPrice ?? 0),
              fmt(i.value),
              `${(i.ppl ?? 0) >= 0 ? "+" : ""}${fmt(i.ppl ?? 0)}`,
            ]),
            margin: { left: margin, right: margin },
            styles: { fontSize: 8.5, cellPadding: 2 },
            headStyles: { fillColor: [30, 64, 175] as RGB, textColor: 255, fontStyle: "bold" },
            alternateRowStyles: { fillColor: [248, 250, 252] as RGB },
            columnStyles: {
              1: { halign: "right" }, 2: { halign: "right" },
              3: { halign: "right" }, 4: { halign: "right" },
            },
            didParseCell(data) {
              if (data.column.index === 4 && data.section === "body") {
                const raw = data.cell.raw as string;
                if (raw.startsWith("-")) data.cell.styles.textColor = [220, 38, 38] as RGB;
              }
            },
          });
          y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
        }
      }

      } // end holdings

      // ══ QUARTERLY / YEARLY ADDITIONAL SECTIONS ═════════════════════════════
      if (isQuarterlyOrYearly) {

        // ── SECTION 6: RISK & STABILITY ───────────────────────────────────────
        if (sec("risk")) {
        sectionDivider("Risk & Stability");

        kpiRow([
          { label: "Annualised Volatility", value: annualisedVol != null ? `${annualisedVol.toFixed(2)}%` : "—" },
          { label: "Max Drawdown", value: maxDrawdown != null ? `-${maxDrawdown.toFixed(2)}%` : "—", color: [220, 38, 38] },
          { label: "Top Concentration", value: concentrationPlatform ? `${concentrationPlatform.weight.toFixed(1)}%` : "—" },
        ]);

        if (concentrationPlatform) {
          checkPage(15);
          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(55, 55, 55);
          doc.text(
            `Largest holding: ${concentrationPlatform.name} at ${concentrationPlatform.weight.toFixed(1)}% of portfolio (${fmt(concentrationPlatform.val)}).`,
            margin, y,
          );
          y += 6;
        }

        if (annualisedVol != null || maxDrawdown != null) {
          checkPage(15);
          bodyText(
            `Annualised volatility is estimated from ${periodHistoryPoints.length} data points within the period. ` +
            `${maxDrawdown != null ? `Max peak-to-trough drawdown: ${maxDrawdown.toFixed(2)}%.` : ""}` +
            (annualisedVol != null && annualisedVol > 20 ? " Volatility is elevated — review position sizing." : ""),
          );
          y += 4;
        }

        } // end risk

        // ── SECTION 7: DIVIDEND REPORT ────────────────────────────────────────
        if (dividendCalendarMap.size > 0 && sec("dividends")) {
          sectionDivider("Dividend Report");

          const allPeriodDivRows: { ticker: string; amount: number; paidOn: string; platformName: string }[] = [];
          for (const [platformId, calendar] of dividendCalendarMap) {
            const platformName = platforms.find(p => p.id === platformId)?.name ?? `Platform ${platformId}`;
            for (const payment of calendar.payments) {
              if (isInPeriod(payment.paidOn, periodStart, periodEnd)) {
                allPeriodDivRows.push({ ticker: payment.ticker, amount: payment.amount, paidOn: payment.paidOn, platformName });
              }
            }
          }
          allPeriodDivRows.sort((a, b) => b.amount - a.amount);

          if (allPeriodDivRows.length > 0) {
            sectionTitle("Dividends Received This Period");
            autoTable(doc, {
              startY: y,
              head: [["Ticker", "Platform", "Paid On", "Amount"]],
              body: [
                ...allPeriodDivRows.map(r => [r.ticker, r.platformName, r.paidOn, fmt(r.amount)]),
                ["Total", "", "", fmt(periodDividends)],
              ],
              margin: { left: margin, right: margin },
              styles: { fontSize: 9, cellPadding: 2.5 },
              headStyles: { fillColor: [5, 150, 105] as RGB, textColor: 255, fontStyle: "bold" },
              alternateRowStyles: { fillColor: [248, 250, 252] as RGB },
              columnStyles: { 3: { halign: "right" } },
              didParseCell(data) {
                if (data.row.index === allPeriodDivRows.length && data.section === "body") {
                  data.cell.styles.fontStyle = "bold";
                }
              },
            });
            y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
          }

          kpiRow([
            { label: "Period Dividends", value: fmt(periodDividends) },
            { label: "Portfolio Dividend Yield (trailing 12m to period end)", value: divYield > 0 ? `${divYield.toFixed(2)}%` : "—" },
            { label: "12m Dividends", value: fmt(totalAnnualisedDivs) },
          ]);

          // Forward dividend calendar (next 3 months)
          const next3mEnd = new Date(); next3mEnd.setMonth(next3mEnd.getMonth() + 3);
          const forwardPayments: { ticker: string; date: string; amount: number; frequency: string; source: string; platformName: string }[] = [];
          for (const [platformId, calendar] of dividendCalendarMap) {
            const platformName = platforms.find(p => p.id === platformId)?.name ?? `Platform ${platformId}`;
            for (const proj of calendar.projections) {
              const d = new Date(proj.date);
              if (d > now && d <= next3mEnd) {
                forwardPayments.push({ ...proj, platformName });
              }
            }
          }
          forwardPayments.sort((a, b) => a.date.localeCompare(b.date));

          if (forwardPayments.length > 0) {
            checkPage(40);
            sectionTitle("Forward Dividend Calendar (Next 3 Months)");
            autoTable(doc, {
              startY: y,
              head: [["Ticker", "Platform", "Est. Pay Date", "Est. Amount", "Frequency"]],
              body: forwardPayments.map(p => [p.ticker, p.platformName, p.date, fmt(p.amount), `${p.frequency} (${p.source})`]),
              margin: { left: margin, right: margin },
              styles: { fontSize: 9, cellPadding: 2.5 },
              headStyles: { fillColor: [5, 150, 105] as RGB, textColor: 255, fontStyle: "bold" },
              alternateRowStyles: { fillColor: [248, 250, 252] as RGB },
              columnStyles: { 3: { halign: "right" } },
            });
            y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
          }
        }

        // ── SECTION 8: REBALANCING PLAN ───────────────────────────────────────
        if (rebalancingRows.length > 0 && sec("rebalancing")) {
          sectionDivider("Rebalancing Plan");

          autoTable(doc, {
            startY: y,
            head: [["Platform", "Current Weight", "Target Weight", "Delta", "Action"]],
            body: rebalancingRows.map(r => [
              r.name,
              `${r.actualWeight.toFixed(1)}%`,
              `${r.targetWeight!.toFixed(1)}%`,
              fmtDelta(r.delta),
              r.action,
            ]),
            margin: { left: margin, right: margin },
            styles: { fontSize: 9, cellPadding: 2.5 },
            headStyles: { fillColor: [124, 58, 237] as RGB, textColor: 255, fontStyle: "bold" },
            alternateRowStyles: { fillColor: [248, 250, 252] as RGB },
            columnStyles: {
              1: { halign: "right" }, 2: { halign: "right" },
              3: { halign: "right" }, 4: { halign: "center" },
            },
            didParseCell(data) {
              if (data.column.index === 4 && data.section === "body") {
                const action = data.cell.raw as string;
                if (action === "Overweight") data.cell.styles.textColor = [220, 38, 38] as RGB;
                else if (action === "Underweight") data.cell.styles.textColor = [37, 99, 235] as RGB;
                else data.cell.styles.textColor = [16, 185, 129] as RGB;
                data.cell.styles.fontStyle = "bold";
              }
              if (data.column.index === 3 && data.section === "body") {
                const raw = data.cell.raw as string;
                if (raw.startsWith("-")) data.cell.styles.textColor = [37, 99, 235] as RGB;
                else if (raw.startsWith("+") && raw !== "+0.0pp") data.cell.styles.textColor = [220, 38, 38] as RGB;
              }
            },
          });
          y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

          checkPage(15);
          bodyText("Rows highlighted in red (overweight) should be trimmed; rows in blue (underweight) may benefit from additional allocation. 'On Target' positions are within ±5 percentage points.");
          y += 4;
        }

        // ── SECTION 9: TAX SUMMARY (yearly only) ─────────────────────────────
        if (periodType === "year" && sec("tax")) {
          sectionDivider("Tax Summary");

          if (realisedGains.length > 0) {
            sectionTitle(`Realised Gains / Losses — ${selectedYear}`);
            const totalRealised = realisedGains.reduce((s, a) => s + a.profitLoss, 0);
            autoTable(doc, {
              startY: y,
              head: [["Asset", "Cost Basis", "Exit Value", "Realised Gain/Loss"]],
              body: [
                ...realisedGains.map(a => [
                  a.name,
                  fmt(a.investedAmount),
                  fmt(a.exitPrice ?? 0),
                  `${a.profitLoss >= 0 ? "+" : ""}${fmt(a.profitLoss)}`,
                ]),
                ["Total", "", "", `${totalRealised >= 0 ? "+" : ""}${fmt(totalRealised)}`],
              ],
              margin: { left: margin, right: margin },
              styles: { fontSize: 9, cellPadding: 2.5 },
              headStyles: { fillColor: [220, 38, 38] as RGB, textColor: 255, fontStyle: "bold" },
              alternateRowStyles: { fillColor: [248, 250, 252] as RGB },
              columnStyles: {
                1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" },
              },
              didParseCell(data) {
                if (data.column.index === 3 && data.section === "body") {
                  const raw = data.cell.raw as string;
                  if (raw.startsWith("-")) data.cell.styles.textColor = [220, 38, 38] as RGB;
                  else if (raw.startsWith("+")) data.cell.styles.textColor = [16, 185, 129] as RGB;
                }
                if (data.row.index === realisedGains.length && data.section === "body") {
                  data.cell.styles.fontStyle = "bold";
                }
              },
            });
            y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
          } else {
            checkPage(12);
            bodyText(`No assets were fully exited during ${selectedYear}.`);
            y += 4;
          }

          if (unrealisedPositions.length > 0) {
            checkPage(40);
            sectionTitle("Unrealised Gains / Losses — Open Positions");
            const totalUnrealised = unrealisedPositions.reduce((s, a) => s + a.profitLoss, 0);
            autoTable(doc, {
              startY: y,
              head: [["Asset", "Cost Basis", "Current Value", "Unrealised Gain/Loss"]],
              body: [
                ...unrealisedPositions.map(a => [
                  a.name,
                  fmt(a.investedAmount),
                  fmt(a.currentValue),
                  `${a.profitLoss >= 0 ? "+" : ""}${fmt(a.profitLoss)}`,
                ]),
                ["Total", "", fmt(unrealisedPositions.reduce((s, a) => s + a.currentValue, 0)), `${totalUnrealised >= 0 ? "+" : ""}${fmt(totalUnrealised)}`],
              ],
              margin: { left: margin, right: margin },
              styles: { fontSize: 9, cellPadding: 2.5 },
              headStyles: { fillColor: [245, 158, 11] as RGB, textColor: 255, fontStyle: "bold" },
              alternateRowStyles: { fillColor: [248, 250, 252] as RGB },
              columnStyles: {
                1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" },
              },
              didParseCell(data) {
                if (data.column.index === 3 && data.section === "body") {
                  const raw = data.cell.raw as string;
                  if (raw.startsWith("-")) data.cell.styles.textColor = [220, 38, 38] as RGB;
                  else if (raw.startsWith("+")) data.cell.styles.textColor = [16, 185, 129] as RGB;
                }
                if (data.row.index === unrealisedPositions.length && data.section === "body") {
                  data.cell.styles.fontStyle = "bold";
                }
              },
            });
            y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
          }
        }
      }

      // ══ AI INSIGHTS ════════════════════════════════════════════════════════
      if (insightData?.insight && sec("ai")) {
        sectionDivider("AI Portfolio Insights");

        doc.setFontSize(9);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(130, 130, 130);
        doc.text("AI-generated analysis — for informational purposes only, not financial advice.", margin, y);
        y += 7;

        const insightText = insightData.insight;
        const questionBlocks = insightText.split(/(?=\d+\.\s)/).filter(Boolean);

        for (const block of questionBlocks) {
          checkPage(20);
          const lines = block.trim().split("\n").filter(Boolean);
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const isHeading = /^\d+\./.test(line);
            doc.setFontSize(isHeading ? 10 : 9.5);
            doc.setFont("helvetica", isHeading ? "bold" : "normal");
            doc.setTextColor(isHeading ? 30 : 55, isHeading ? 30 : 55, isHeading ? 30 : 55);
            const wrapped: string[] = doc.splitTextToSize(line, contentW);
            for (const wl of wrapped) {
              checkPage(6);
              doc.text(wl, margin, y);
              y += 5;
            }
          }
          y += 2;
        }

        if (questionBlocks.length === 0) {
          const lines: string[] = doc.splitTextToSize(insightText, contentW);
          doc.setFontSize(9.5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(55, 55, 55);
          for (const line of lines) {
            checkPage(6);
            doc.text(line, margin, y);
            y += 5;
          }
        }
      }

      // ══ TABLE OF CONTENTS (rendered back on page 2) ═══════════════════════
      if (tocEntries.length > 0 && tocPageNum > 0) {
        doc.setPage(tocPageNum);
        y = margin;

        // TOC header
        doc.setFillColor(37, 99, 235);
        doc.rect(0, 0, pageW, 14, "F");
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text("Contents", margin, 9);
        y = 26;
        doc.setTextColor(30, 30, 30);

        const rowH = 9;
        tocEntries.forEach((entry, idx) => {
          const num = `${idx + 1}`;
          const pageStr = String(entry.page);

          // Alternating row background
          if (idx % 2 === 0) {
            doc.setFillColor(248, 250, 252);
            doc.rect(margin, y - 6, contentW, rowH, "F");
          }

          // Chapter number
          doc.setFontSize(9.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(37, 99, 235);
          doc.text(num, margin + 1, y);

          // Chapter title
          doc.setFont("helvetica", "normal");
          doc.setTextColor(30, 30, 30);
          doc.text(entry.label, margin + 10, y);

          // Dotted leader
          const titleW = doc.getTextWidth(entry.label);
          const pageNumW = doc.getTextWidth(pageStr);
          const leaderStart = margin + 10 + titleW + 3;
          const leaderEnd = pageW - margin - pageNumW - 3;
          if (leaderEnd > leaderStart) {
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.2);
            doc.setLineDashPattern([0.5, 1.5], 0);
            doc.line(leaderStart, y - 1, leaderEnd, y - 1);
            doc.setLineDashPattern([], 0);
          }

          // Page number
          doc.setFont("helvetica", "bold");
          doc.setTextColor(37, 99, 235);
          doc.text(pageStr, pageW - margin, y, { align: "right" });

          // Clickable invisible link over the entire row
          doc.link(margin, y - 7, contentW, rowH, { pageNumber: entry.page });

          y += rowH;
        });
      }

      // ══ PAGE FOOTER ════════════════════════════════════════════════════════
      const pageCount = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(160, 160, 160);
        doc.text(
          `InvestTrack · ${getPeriodLabel()} ${periodType === "month" ? "Monthly" : periodType === "quarter" ? "Quarterly" : "Annual"} Report · Page ${i} of ${pageCount}`,
          pageW / 2, pageH - 8,
          { align: "center" },
        );
      }

      const filename = `report-${getWaterfallKey().toLowerCase()}.pdf`;
      doc.save(filename);
      onOpenChange(false);
      toast({ title: "Report downloaded", description: filename });

    } catch (err) {
      console.error("PDF generation failed:", err);
      toast({
        title: "Export failed",
        description: "Could not generate the report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }

  const availableSections = SECTION_REGISTRY.filter(s => s.availableFor.includes(periodType));
  const checkedSections = SECTION_REGISTRY.filter(s => selectedSections.has(s.id));
  const checkedCount = checkedSections.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export Portfolio Report</DialogTitle>
          <DialogDescription>
            Choose a period and select which chapters to include in the PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="period-type">Report type</Label>
            <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
              <SelectTrigger id="period-type" data-testid="select-period-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Monthly</SelectItem>
                <SelectItem value="quarter">Quarterly</SelectItem>
                <SelectItem value="year">Annual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {discoveryError && (
            <div className="flex items-center justify-between rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <span>Could not load available periods.</span>
              <button
                type="button"
                className="ml-3 underline underline-offset-2 hover:no-underline shrink-0"
                onClick={runDiscovery}
                data-testid="button-retry-discovery"
              >
                Retry
              </button>
            </div>
          )}

          <div className="flex gap-2">
            {periodType === "month" && (
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="select-month">Month</Label>
                {periodsLoading ? (
                  <div className="h-9 rounded-md border bg-muted/40 flex items-center px-3 gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…
                  </div>
                ) : availableMonths.length === 0 ? (
                  <div className="h-9 rounded-md border bg-muted/40 flex items-center px-3 text-sm text-muted-foreground">No data</div>
                ) : (
                  <Select value={selectedMonth} onValueChange={setSelectedMonth} disabled={periodsLoading}>
                    <SelectTrigger id="select-month" data-testid="select-month">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableMonths.map(mm => {
                        const num = Number(mm);
                        return <SelectItem key={mm} value={String(num)}>{MONTH_NAMES[num - 1]}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {periodType === "quarter" && (
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="select-quarter">Quarter</Label>
                {periodsLoading ? (
                  <div className="h-9 rounded-md border bg-muted/40 flex items-center px-3 gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…
                  </div>
                ) : availableQuarters.length === 0 ? (
                  <div className="h-9 rounded-md border bg-muted/40 flex items-center px-3 text-sm text-muted-foreground">No data</div>
                ) : (
                  <Select value={selectedQuarter} onValueChange={setSelectedQuarter} disabled={periodsLoading}>
                    <SelectTrigger id="select-quarter" data-testid="select-quarter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableQuarters.map(q => (
                        <SelectItem key={q} value={q}>Q{q}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <div className={periodType === "year" ? "flex-1 space-y-1.5" : "w-28 space-y-1.5"}>
              <Label htmlFor="select-year">Year</Label>
              {periodsLoading ? (
                <div className="h-9 rounded-md border bg-muted/40 flex items-center px-3 gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…
                </div>
              ) : availableYears.length === 0 ? (
                <div className="h-9 rounded-md border bg-muted/40 flex items-center px-3 text-sm text-muted-foreground">No data</div>
              ) : (
                <Select value={selectedYear} onValueChange={setSelectedYear} disabled={periodsLoading}>
                  <SelectTrigger id="select-year" data-testid="select-year">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableYears.map(yr => (
                      <SelectItem key={yr} value={yr}>{yr}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Chapters</Label>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-primary underline-offset-2 hover:underline"
                  data-testid="button-select-all-sections"
                >
                  Select all
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-muted-foreground underline-offset-2 hover:underline"
                  data-testid="button-clear-all-sections"
                >
                  Clear all
                </button>
              </div>
            </div>

            <div className="overflow-y-auto max-h-48 rounded-md border divide-y">
              {SECTION_REGISTRY.map((section) => {
                const isAvailable = section.availableFor.includes(periodType);
                const isChecked = selectedSections.has(section.id);
                return (
                  <label
                    key={section.id}
                    className={`flex items-center gap-3 px-3 py-2 transition-colors ${isAvailable ? "cursor-pointer hover:bg-muted/50" : "cursor-not-allowed opacity-40"}`}
                    data-testid={`section-row-${section.id}`}
                  >
                    <Checkbox
                      id={`section-${section.id}`}
                      checked={isChecked}
                      disabled={!isAvailable}
                      onCheckedChange={() => isAvailable && toggleSection(section.id)}
                      data-testid={`checkbox-section-${section.id}`}
                    />
                    <span className="flex-1 text-sm">{section.label}</span>
                    {section.availableFor.length === 1 && section.availableFor[0] === "year" && (
                      <Badge variant="secondary" className="text-xs shrink-0">Annual only</Badge>
                    )}
                    {section.availableFor.length === 2 && (
                      <Badge variant="secondary" className="text-xs shrink-0">Q + Annual</Badge>
                    )}
                  </label>
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground">
              {checkedCount === 0
                ? "No chapters selected — PDF will contain only the cover page."
                : `${checkedSections.length === availableSections.length ? `All ${checkedCount}` : `${checkedCount} of ${availableSections.length}`} chapters selected: ${checkedSections.map(s => s.label).join(", ")}.`
              }
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={generating}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={generating || periodsLoading || discoveryError || availableYears.length === 0} data-testid="button-generate-report">
            {generating ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</>
            ) : (
              <><Download className="h-4 w-4 mr-2" />Generate PDF</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
