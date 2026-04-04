import { Layout } from "@/components/Layout";
import { StatCard } from "@/components/StatCard";
import { usePlatforms } from "@/hooks/use-platforms";
import { useAuth } from "@/App";
import { formatCurrency, formatCurrencyRounded, formatCompactCurrency, getCurrencySymbol } from "@/lib/currency";
import {
  Wallet, TrendingUp, DollarSign, Check, RefreshCw, Loader2, CheckCircle, XCircle,
  X, Save, Bookmark, Trash2, Target, ArrowUpCircle, ArrowDownCircle,
  LineChart as LineChartIcon, BarChart2, Filter, Percent,
} from "lucide-react";
import { PlatformIcon } from "@/components/PlatformIcon";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend,
  BarChart, Bar, Cell, LabelList,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { Link, useLocation } from "wouter";
import { format, formatDistanceToNow } from "date-fns";
import { useState, useRef, useEffect, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PortfolioHeatmap, type EnrichedAsset } from "@/components/PortfolioHeatmap";
import { WaterfallChart } from "@/components/WaterfallChart";
import type { DashboardFilter } from "@shared/schema";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtMonthLabel(m: string): string {
  const [y, mo] = m.split("-");
  return `${MONTHS[Number(mo) - 1]} ${y}`;
}

interface HistoryPoint {
  date: string;
  value: number;
  invested: number;
}

interface PlatformMomEntry {
  platformId: number;
  name: string;
  customIconUrl: string | null;
  currentValue: number;
  prevValue: number;
  momChange: number;
  momGrowthPercent: number;
}

interface PlatformRollingEntry {
  platformId: number;
  name: string;
  color: string;
  change: number;
  pct: number;
}

interface PlatformRollingReturns {
  d7:  PlatformRollingEntry[];
  d30: PlatformRollingEntry[];
  d90: PlatformRollingEntry[];
}

function computeRollingReturn(days: number, historyData: HistoryPoint[]): { change: number; pct: number } {
  const sorted = [...historyData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const latest = sorted[0];
  const target = new Date(new Date(latest.date).getTime() - days * 24 * 60 * 60 * 1000);
  const prev = sorted.slice(1).reduce((best, v) => {
    const dist = Math.abs(new Date(v.date).getTime() - target.getTime());
    const bestDist = Math.abs(new Date(best.date).getTime() - target.getTime());
    return dist < bestDist ? v : best;
  });
  const change = (latest.value - prev.value) - (latest.invested - prev.invested);
  const pct = prev.value > 0 ? (change / prev.value) * 100 : 0;
  return { change, pct };
}

interface InvestmentFlowResponse {
  months: Record<string, string | number>[];
  platforms: { name: string; color: string }[];
}

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  positive?: boolean;
  neutral?: boolean;
}

function KpiCard({ label, value, sub, icon, positive, neutral }: KpiCardProps) {
  const valueColor = neutral ? "text-foreground" : positive ? "text-emerald-500" : "text-red-500";
  return (
    <Card data-testid={`kpi-card-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={cn("text-2xl font-bold mt-1", valueColor)}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className="p-2 rounded-lg bg-muted/50">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

interface PlatformGain {
  platformId: number;
  name: string;
  color: string;
  prevVal: number;
  currVal: number;
  gain: number;
  gainPct: number | null;
}

interface HeatmapTooltipData {
  label: string;
  returnPct: number;
  absoluteChange: number;
  currency: string;
  platformBreakdown?: PlatformGain[];
}

function HeatmapTooltipCard({ label, returnPct, absoluteChange, currency, platformBreakdown }: HeatmapTooltipData) {
  const significant = platformBreakdown?.filter(p => Math.abs(p.gain) > 0.01) ?? [];
  return (
    <div className="bg-popover border rounded-lg shadow-lg p-3 text-xs pointer-events-none min-w-[200px]">
      <p className="font-semibold mb-1">{label}</p>
      <div className="flex justify-between gap-4 mb-2">
        <span className={returnPct >= 0 ? "text-emerald-500" : "text-red-500"}>{fmtPct(returnPct)}</span>
        <span className="text-muted-foreground">{formatCurrency(absoluteChange, currency)}</span>
      </div>
      {significant.length > 0 && (
        <>
          <div className="border-t my-2" />
          <div className="space-y-1">
            {significant.map(p => (
              <div key={p.platformId} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                <span className="flex-1 truncate text-muted-foreground">{p.name}</span>
                <span className={cn("font-medium shrink-0", p.gain >= 0 ? "text-emerald-500" : "text-red-500")}>
                  {p.gain >= 0 ? "+" : ""}{formatCurrency(p.gain, currency)}
                  {p.gainPct != null && (
                    <span className="ml-1 opacity-70">({p.gainPct >= 0 ? "+" : ""}{p.gainPct.toFixed(2)}%)</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

type SortKey = "name" | "invested" | "current" | "pnl" | "roi" | "mom" | "target" | "delta";
type SortDir = "asc" | "desc";

export default function Dashboard() {
  const { user } = useAuth();
  const currency = user?.currency || "EUR";
  const [, navigate] = useLocation();
  const { data: platforms, isLoading: isPlatformsLoading } = usePlatforms();
  const { toast } = useToast();

  // ── Shared filter state ──────────────────────────────────────────────────
  const [excludedPlatforms, setExcludedPlatforms] = useState<Set<number>>(new Set());
  const [filterPresetsOpen, setFilterPresetsOpen] = useState(false);
  const [filterPresetName, setFilterPresetName] = useState("");

  // ── Dashboard chart state ────────────────────────────────────────────────
  const [range, setRange] = useState("all");
  const [specificYear, setSpecificYear] = useState<string | null>(null);
  const [specificMonth, setSpecificMonth] = useState<string | null>(null);
  const [chartView, setChartView] = useState<"overview" | "profit" | "monthly" | "all">("overview");
  const [chartType, setChartType] = useState<"line" | "bar">("line");
  const [chartValueMode, setChartValueMode] = useState<"value" | "pct">("value");
  const [chartAggregation, setChartAggregation] = useState<"month" | "quarter" | "year">("month");
  const [displayedChartView, setDisplayedChartView] = useState<"overview" | "profit" | "monthly" | "all">("overview");
  const [displayedChartType, setDisplayedChartType] = useState<"line" | "bar">("line");
  const [displayedChartValueMode, setDisplayedChartValueMode] = useState<"value" | "pct">("value");
  const [displayedChartAggregation, setDisplayedChartAggregation] = useState<"month" | "quarter" | "year">("month");
  const [chartFading, setChartFading] = useState(false);

  // ── Allocation targets state ─────────────────────────────────────────────
  const [localTargets, setLocalTargets] = useState<Record<number, string>>({});
  const [targetsDirty, setTargetsDirty] = useState(false);

  useEffect(() => {
    if (platforms && !targetsDirty) {
      const initial: Record<number, string> = {};
      platforms.forEach(p => {
        initial[p.id] = (p as any).targetAllocation != null ? String((p as any).targetAllocation) : '';
      });
      setLocalTargets(initial);
    }
  }, [platforms]);

  // ── Analytics state ──────────────────────────────────────────────────────
  const [tooltip, setTooltip] = useState<{ x: number; y: number; data: HeatmapTooltipData } | null>(null);
  const [heatmapMode, setHeatmapMode] = useState<"pct" | "value">("pct");
  const [activeHeatmapTab, setActiveHeatmapTab] = useState<string>("monthly");
  const [sortKey, setSortKey] = useState<SortKey>("roi");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ── Scraper state ────────────────────────────────────────────────────────
  const [scrapeLog, setScrapeLog] = useState<{ platformName: string; success: boolean; message: string }[] | null>(null);
  const [scrapeLogOpen, setScrapeLogOpen] = useState(false);
  const scrapeLogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrapeLogRef.current) {
      scrapeLogRef.current.scrollTop = scrapeLogRef.current.scrollHeight;
    }
  }, [scrapeLog]);

  useEffect(() => {
    setChartFading(true);
    const t = setTimeout(() => {
      setDisplayedChartView(chartView);
      setDisplayedChartType(chartType);
      setDisplayedChartValueMode(chartValueMode);
      setDisplayedChartAggregation(chartAggregation);
      setChartFading(false);
    }, 160);
    return () => clearTimeout(t);
  }, [chartView, chartType, chartValueMode, chartAggregation]);

  // ── Helper: togglePlatform ───────────────────────────────────────────────
  function togglePlatform(id: number) {
    setExcludedPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const excludedPlatformKey = useMemo(
    () => Array.from(excludedPlatforms).sort().join(","),
    [excludedPlatforms]
  );

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: savedFilters } = useQuery<DashboardFilter[]>({
    queryKey: ['/api/dashboard-filters'],
  });

  const { data: scraperConfigs } = useQuery<{ platformId: number; platformName: string; lastScrapeAt: string | null }[]>({
    queryKey: ['/api/scraper-configs'],
  });

  const lastScrapeAt = scraperConfigs
    ?.map(c => c.lastScrapeAt ? new Date(c.lastScrapeAt) : null)
    .filter((d): d is Date => d !== null)
    .reduce<Date | null>((max, d) => (max === null || d > max ? d : max), null) ?? null;

  const { data: availableFilters } = useQuery({
    queryKey: ['/api/portfolio/available-filters'],
    queryFn: async () => {
      const res = await fetch('/api/portfolio/available-filters', { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch filters");
      return await res.json();
    }
  });

  const { data: history, isLoading: isHistoryLoading } = useQuery({
    queryKey: [api.portfolio.history.path, range, specificYear, specificMonth, excludedPlatformKey],
    queryFn: async () => {
      let url = `${api.portfolio.history.path}?range=${range}`;
      if (specificYear) url += `&year=${specificYear}`;
      if (specificMonth) url += `&month_select=${specificMonth}`;
      if (excludedPlatforms.size > 0) url += `&excludePlatforms=${Array.from(excludedPlatforms).join(',')}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch history");
      return await res.json();
    },
    placeholderData: (previousData) => previousData,
  });

  const { data: allPlatformMomData } = useQuery<PlatformMomEntry[]>({
    queryKey: ['/api/portfolio/platform-mom'],
    queryFn: async () => {
      const res = await fetch('/api/portfolio/platform-mom', { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch platform MoM");
      return await res.json();
    }
  });

  const platformMomData = allPlatformMomData?.filter(p => !excludedPlatforms.has(p.platformId));

  const { data: historyData } = useQuery<HistoryPoint[]>({
    queryKey: ["/api/portfolio/history", "all"],
    queryFn: async () => {
      const res = await fetch("/api/portfolio/history?range=all", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
  });

  const rollingReturns = historyData && historyData.length >= 2 ? {
    d7:  computeRollingReturn(7,  historyData),
    d30: computeRollingReturn(30, historyData),
    d90: computeRollingReturn(90, historyData),
  } : undefined;

  const { data: platformRollingReturns } = useQuery<PlatformRollingReturns>({
    queryKey: ['/api/portfolio/platform-rolling-returns'],
    queryFn: async () => {
      const res = await fetch('/api/portfolio/platform-rolling-returns', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch platform rolling returns');
      return res.json();
    },
  });

  const { data: platformBreakdownByMonth } = useQuery<Record<string, PlatformGain[]>>({
    queryKey: ["/api/analytics/monthly-platform-breakdown"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/monthly-platform-breakdown", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch platform breakdown");
      return res.json();
    },
  });

  const { data: analyticsAssets } = useQuery<EnrichedAsset[]>({
    queryKey: ["/api/analytics/assets"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/assets", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch analytics assets");
      return res.json();
    },
  });

  const { data: flowData } = useQuery<InvestmentFlowResponse>({
    queryKey: ["/api/analytics/investment-flow", "by-platform"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/investment-flow", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch flow");
      return res.json();
    },
  });

  // ── Mutations ────────────────────────────────────────────────────────────
  const saveFilterMutation = useMutation({
    mutationFn: async (name: string) => {
      await apiRequest('POST', '/api/dashboard-filters', { name, excludedPlatformIds: Array.from(excludedPlatforms) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard-filters'] });
      setFilterPresetName("");
      toast({ title: "Filter saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save filter", description: err.message, variant: "destructive" });
    },
  });

  const deleteFilterMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/dashboard-filters/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard-filters'] });
      toast({ title: "Filter deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete filter", description: err.message, variant: "destructive" });
    },
  });

  const saveTargetsMutation = useMutation({
    mutationFn: async () => {
      if (!platforms) return;
      await Promise.all(
        platforms.map(p =>
          apiRequest('PATCH', `/api/platforms/${p.id}`, {
            targetAllocation: localTargets[p.id] !== '' && localTargets[p.id] != null
              ? Number(localTargets[p.id])
              : null,
          })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.platforms.list.path] });
      setTargetsDirty(false);
      toast({ title: "Allocation targets saved" });
    },
    onError: () => {
      toast({ title: "Failed to save targets", variant: "destructive" });
    },
  });

  const scrapeAllMutation = useMutation({
    mutationFn: async () => {
      setScrapeLog([]);
      setScrapeLogOpen(true);

      const configsRes = await fetch('/api/scraper-configs', { credentials: 'include' });
      if (!configsRes.ok) throw new Error("Failed to fetch scraper configs");
      const configs: { platformId: number; platformName: string }[] = await configsRes.json();

      if (configs.length === 0) return { results: [] };

      const results: { platformName: string; success: boolean; message: string }[] = [];

      for (const config of configs) {
        setScrapeLog(prev => [...(prev || []), { platformName: config.platformName, success: true, message: "Scraping..." }]);
        try {
          const scrapeRes = await fetch(`/api/platforms/${config.platformId}/scrape`, {
            method: 'POST',
            credentials: 'include',
          });
          const data = await scrapeRes.json();
          const entry = {
            platformName: config.platformName,
            success: scrapeRes.ok,
            message: data.message || (scrapeRes.ok ? "Success" : "Failed"),
          };
          results.push(entry);
          setScrapeLog(prev => {
            const updated = [...(prev || [])];
            const idx = updated.findLastIndex(e => e.platformName === config.platformName);
            if (idx >= 0) updated[idx] = entry;
            return updated;
          });
        } catch (err: any) {
          const entry = { platformName: config.platformName, success: false, message: err.message || "Failed" };
          results.push(entry);
          setScrapeLog(prev => {
            const updated = [...(prev || [])];
            const idx = updated.findLastIndex(e => e.platformName === config.platformName);
            if (idx >= 0) updated[idx] = entry;
            return updated;
          });
        }
      }

      return { results };
    },
    onSuccess: (data) => {
      const succeeded = data.results?.filter((r: any) => r.success).length || 0;
      const failed = data.results?.filter((r: any) => !r.success).length || 0;
      if (data.results.length > 0) {
        toast({
          title: "Scraping Complete",
          description: `${succeeded} succeeded${failed > 0 ? `, ${failed} failed` : ''}`,
          variant: failed > 0 ? "destructive" : "default",
        });
      }
      queryClient.invalidateQueries({ queryKey: [api.portfolio.history.path] });
      queryClient.invalidateQueries({ queryKey: ['/api/platforms'] });
      queryClient.invalidateQueries({ queryKey: ['/api/scraper-configs'] });
    },
    onError: (err: any) => {
      setScrapeLog(prev => [...(prev || []), { platformName: "Error", success: false, message: err.message }]);
      toast({ title: "Scraping Failed", description: err.message, variant: "destructive" });
    },
  });

  // ── Computed: filters ────────────────────────────────────────────────────
  const years = availableFilters?.years || [];
  const monthsData = availableFilters?.months?.map((m: string) => {
    const [y, mm] = m.split('-');
    const monthName = new Date(parseInt(y), parseInt(mm) - 1).toLocaleString('default', { month: 'long' });
    return { value: mm, label: monthName, year: y };
  }) || [];
  const currentYear = years[0] || new Date().getFullYear().toString();

  // ── Computed: active platforms (filter-aware) ────────────────────────────
  const activePlatforms = useMemo(
    () => platforms?.filter(p => !excludedPlatforms.has(p.id)),
    [platforms, excludedPlatforms]
  );

  // ── Computed: dashboard chart data ───────────────────────────────────────
  const chartData = useMemo(() => {
    if (!history || history.length === 0) return [];

    const latestKey = format(new Date(history[history.length - 1].date), 'yyyy-MM');

    const monthMap = new Map<string, { value: number; invested: number; date: string; dist: number }>();
    for (const h of history) {
      const d = new Date(h.date);
      const key = format(d, 'yyyy-MM');
      const isLatestMonth = key === latestKey;
      const existing = monthMap.get(key);
      if (isLatestMonth) {
        if (!existing || d.getTime() > new Date(existing.date).getTime()) {
          monthMap.set(key, { value: h.value, invested: h.invested, date: h.date, dist: 0 });
        }
      } else {
        const target = new Date(d.getFullYear(), d.getMonth(), 10);
        const dist = Math.abs(d.getTime() - target.getTime());
        if (!existing || dist < existing.dist) {
          monthMap.set(key, { value: h.value, invested: h.invested, date: h.date, dist });
        }
      }
    }

    return Array.from(monthMap.values()).map(data => ({
      date: data.date,
      value: data.value,
      invested: data.invested,
    }));
  }, [history]);

  // ── Computed: monthly growth series (heatmap-aligned, 10th-to-10th) ─────
  // Uses the same platformBreakdownByMonth data as the heatmap so the
  // Monthly Growth chart and heatmap always show identical totals.
  const monthlySeriesData = useMemo(() => {
    if (!platformBreakdownByMonth) return [];

    // Compute a date cutoff from the current range selection (mirrors server logic)
    const now = new Date();
    let cutoffMs: number | null = null;
    let exactYear: number | null = null;
    let exactYM: string | null = null;

    if (range === "quarter") {
      cutoffMs = now.getTime() - 90 * 24 * 60 * 60 * 1000;
    } else if (range === "year") {
      cutoffMs = now.getTime() - 365 * 24 * 60 * 60 * 1000;
    } else if (range.startsWith("year-")) {
      exactYear = parseInt(range.split("-")[1]);
    } else if (range.startsWith("month-")) {
      const parts = range.split("-");
      exactYM = `${parts[1]}-${parts[2].padStart(2, "0")}`;
    }
    // "all" → no cutoff

    return Object.entries(platformBreakdownByMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, platforms]) => {
        const filteredPlatforms = platforms.filter(p => !excludedPlatforms.has(p.platformId));
        const monthlyChange = filteredPlatforms.reduce((s, p) => s + p.gain, 0);
        const totalPrevVal = filteredPlatforms.reduce((s, p) => s + p.prevVal, 0);
        const monthlyChangePct = totalPrevVal > 0 ? (monthlyChange / totalPrevVal) * 100 : 0;
        const [year, month] = ym.split("-").map(Number);
        const date = `${ym}-10`;
        const timestamp = new Date(year, month - 1, 10).getTime();
        return { date, timestamp, monthlyChange, monthlyChangePct, platformBreakdown: filteredPlatforms };
      })
      .filter(entry => {
        if (exactYM !== null) return entry.date.substring(0, 7) === exactYM;
        if (exactYear !== null) return parseInt(entry.date.substring(0, 4)) === exactYear;
        if (cutoffMs !== null) return entry.timestamp >= cutoffMs;
        return true;
      });
  }, [platformBreakdownByMonth, excludedPlatforms, range]);

  // ── Computed: aggregated monthly series (quarter / year averages) ─────────
  const aggregatedSeriesData = useMemo(() => {
    if (displayedChartAggregation === "month") return monthlySeriesData;

    const groups = new Map<string, {
      totalChange: number; totalChangePct: number; count: number;
      platformTotals: Map<number, { gain: number; prevVal: number; name: string; color: string; platformId: number }>;
    }>();

    for (const entry of monthlySeriesData) {
      const [y, m] = entry.date.split("-").map(Number);
      const key = displayedChartAggregation === "quarter"
        ? `${y}-Q${Math.ceil(m / 3)}`
        : `${y}`;

      if (!groups.has(key)) {
        groups.set(key, { totalChange: 0, totalChangePct: 0, count: 0, platformTotals: new Map() });
      }
      const g = groups.get(key)!;
      g.totalChange += entry.monthlyChange;
      g.totalChangePct += entry.monthlyChangePct;
      g.count++;
      for (const pb of entry.platformBreakdown) {
        const existing = g.platformTotals.get(pb.platformId);
        if (existing) {
          existing.gain += pb.gain;
          existing.prevVal += pb.prevVal;
        } else {
          g.platformTotals.set(pb.platformId, { ...pb });
        }
      }
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, g]) => {
        const avgChange = g.count > 0 ? g.totalChange / g.count : 0;
        const avgChangePct = g.count > 0 ? g.totalChangePct / g.count : 0;
        const platformBreakdown = Array.from(g.platformTotals.values()).map(p => ({
          ...p,
          gain: g.count > 0 ? p.gain / g.count : 0,
          prevVal: g.count > 0 ? p.prevVal / g.count : 0,
        }));
        return { date: key, timestamp: 0, monthlyChange: avgChange, monthlyChangePct: avgChangePct, platformBreakdown };
      });
  }, [monthlySeriesData, displayedChartAggregation]);

  const aggregatedChartData = useMemo(() => {
    if (!chartData || chartData.length === 0 || displayedChartAggregation === "month") return null;
    const groups = new Map<string, any[]>();
    for (const row of chartData) {
      const [y, m] = (row.date as string).split("-").map(Number);
      const key = displayedChartAggregation === "quarter" ? `${y}-Q${Math.ceil(m / 3)}` : `${y}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, rows]) => {
        const last = rows[rows.length - 1];
        const gain = last.value - last.invested;
        const gainPct = last.invested > 0 ? (gain / last.invested) * 100 : 0;
        return { date: key, value: last.value, invested: last.invested, gain, gainPct };
      });
  }, [chartData, displayedChartAggregation]);

  // ── Computed: analytics ──────────────────────────────────────────────────
  const excludedPlatformNames = useMemo(() => {
    if (!platforms) return new Set<string>();
    return new Set(platforms.filter(p => excludedPlatforms.has(p.id)).map(p => p.name));
  }, [platforms, excludedPlatforms]);

  const filteredFlowPlatforms = useMemo(() => {
    if (!flowData?.platforms) return [];
    return flowData.platforms.filter(p => !excludedPlatformNames.has(p.name));
  }, [flowData, excludedPlatformNames]);

  const filteredFlowMonths = useMemo(() => {
    if (!flowData?.months) return [];
    return flowData.months.map(month => {
      let total = 0;
      for (const [key, val] of Object.entries(month)) {
        if (key !== "month" && !excludedPlatformNames.has(key)) total += (val as number) || 0;
      }
      return { ...month, __total__: total };
    });
  }, [flowData, excludedPlatformNames]);

  const [flowAggregation, setFlowAggregation] = useState<"month" | "quarter" | "year">("month");

  const aggregatedFlowMonths = useMemo(() => {
    if (flowAggregation === "month") return filteredFlowMonths;
    const groups = new Map<string, Record<string, number>>();
    for (const row of filteredFlowMonths) {
      const m = row.month as string;
      const [y, mo] = m.split("-").map(Number);
      const key = flowAggregation === "quarter" ? `${y}-Q${Math.ceil(mo / 3)}` : `${y}`;
      if (!groups.has(key)) groups.set(key, { __total__: 0 });
      const g = groups.get(key)!;
      for (const [k, v] of Object.entries(row)) {
        if (k === "month") continue;
        g[k] = (g[k] || 0) + ((v as number) || 0);
      }
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, g]) => ({ month: key, ...g }));
  }, [filteredFlowMonths, flowAggregation]);

  function fmtFlowLabel(m: string): string {
    if (m.includes("-Q")) {
      const [y, q] = m.split("-");
      return `${q} '${y.slice(2)}`;
    }
    if (/^\d{4}$/.test(m)) return m;
    return fmtMonthLabel(m);
  }

  const kpis = useMemo(() => {
    if (!activePlatforms || !historyData || historyData.length === 0) return null;

    const totalInvested = activePlatforms.reduce((s, p) => s + (Number(p.totalInvested) || 0), 0);
    const totalCurrent = activePlatforms.reduce((s, p) => s + (Number(p.currentValue) || 0), 0);
    const totalROI = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0;

    const first = historyData[0];
    const last = historyData[historyData.length - 1];
    const years = (new Date(last.date).getTime() - new Date(first.date).getTime()) / (1000 * 60 * 60 * 24 * 365.25);

    let twrFactor = 1;
    let validPeriods = 0;
    if (platformBreakdownByMonth) {
      const monthKeys = Object.keys(platformBreakdownByMonth).sort();
      for (const key of monthKeys) {
        const entries = platformBreakdownByMonth[key].filter(p => !excludedPlatforms.has(p.platformId));
        const gain = entries.reduce((s, p) => s + p.gain, 0);
        const prevVal = entries.reduce((s, p) => s + p.prevVal, 0);
        if (prevVal > 0) { twrFactor *= (1 + gain / prevVal); validPeriods++; }
      }
    } else {
      for (let i = 1; i < historyData.length; i++) {
        const prev = historyData[i - 1];
        const curr = historyData[i];
        if (prev.value <= 0) continue;
        const netCashAdded = curr.invested - prev.invested;
        const periodReturn = (curr.value - prev.value - netCashAdded) / prev.value;
        twrFactor *= (1 + periodReturn);
        validPeriods++;
      }
    }
    const twr = validPeriods > 0 ? (twrFactor - 1) * 100 : null;
    const cagr = twr != null && years > 0 ? (Math.pow(twrFactor, 1 / years) - 1) * 100 : null;

    const bestPlatform = activePlatforms.reduce(
      (best, p) => {
        const invested = Number(p.totalInvested) || 0;
        const current = Number(p.currentValue) || 0;
        const roi = invested > 0 ? ((current - invested) / invested) * 100 : -Infinity;
        return roi > best.roi ? { name: p.name, roi } : best;
      },
      { name: "-", roi: -Infinity }
    );

    const ageMs = new Date().getTime() - new Date(first.date).getTime();
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    const ageMonths = Math.floor(ageDays / 30);

    return { totalROI, cagr, twr, bestPlatform, ageDays, ageMonths };
  }, [activePlatforms, historyData, platformBreakdownByMonth, excludedPlatforms]);

  const activeHeatmapData = useMemo(() => {
    if (!platformBreakdownByMonth) return null;

    const monthKeys = Object.keys(platformBreakdownByMonth).sort();
    if (monthKeys.length < 1) return null;

    const years = Array.from(new Set(monthKeys.map(k => k.split("-")[0]))).sort();
    const cells: { year: string; month: number; returnPct: number; absoluteChange: number }[] = [];

    for (const key of monthKeys) {
      const entries = platformBreakdownByMonth[key].filter(p => !excludedPlatforms.has(p.platformId));
      const filteredGain = entries.reduce((s, p) => s + p.gain, 0);
      const filteredPrevVal = entries.reduce((s, p) => s + p.prevVal, 0);
      const [cy, cm] = key.split("-").map(Number);
      const returnPct = filteredPrevVal > 0 ? (filteredGain / filteredPrevVal) * 100 : 0;
      cells.push({ year: String(cy), month: cm, returnPct, absoluteChange: filteredGain });
    }

    return { years, cells };
  }, [platformBreakdownByMonth, excludedPlatforms]);

  const roiData = useMemo(() => {
    if (!activePlatforms) return [];
    return activePlatforms
      .map(p => {
        const invested = Number(p.totalInvested) || 0;
        const current = Number(p.currentValue) || 0;
        const roi = invested > 0 ? ((current - invested) / invested) * 100 : 0;
        return { name: p.name, roi, color: p.color };
      })
      .sort((a, b) => b.roi - a.roi);
  }, [activePlatforms]);

  const rebalancerData = useMemo(() => {
    if (!activePlatforms) return null;
    const totalPortfolioValue = (platforms ?? activePlatforms).reduce((s, p) => s + (Number(p.currentValue) || 0), 0);
    const withTargets = activePlatforms.filter(p => p.targetAllocation != null && Number(p.targetAllocation) > 0);
    if (withTargets.length === 0) return null;

    const items = withTargets.map(p => {
      const currentValue = Number(p.currentValue) || 0;
      const targetPct = Number(p.targetAllocation);
      const targetAmount = (targetPct / 100) * totalPortfolioValue;
      const surplus = currentValue - targetAmount;
      return { ...p, currentValue, targetPct, targetAmount, surplus };
    });

    const itemsWithPct = items.map(p => ({
      ...p,
      currentPct: totalPortfolioValue > 0 ? (p.currentValue / totalPortfolioValue) * 100 : 0,
    }));

    const sources = itemsWithPct.filter(i => i.surplus > 0.01).sort((a, b) => b.surplus - a.surplus);
    const destinations = itemsWithPct.filter(i => i.surplus < -0.01).sort((a, b) => a.surplus - b.surplus);

    const srcRem = sources.map(s => ({ ...s, remaining: s.surplus }));
    const dstRem = destinations.map(d => ({ ...d, remaining: Math.abs(d.surplus) }));
    const flows: { from: (typeof itemsWithPct)[0]; to: (typeof itemsWithPct)[0]; amount: number }[] = [];
    let si = 0, di = 0;
    while (si < srcRem.length && di < dstRem.length) {
      const amount = Math.min(srcRem[si].remaining, dstRem[di].remaining);
      if (amount > 0.01) flows.push({ from: sources[si], to: destinations[di], amount });
      srcRem[si].remaining -= amount;
      dstRem[di].remaining -= amount;
      if (srcRem[si].remaining < 0.01) si++;
      if (dstRem[di].remaining < 0.01) di++;
    }

    const currentDonut = itemsWithPct.map(p => ({ name: p.name, value: p.currentValue, color: p.color, pct: p.currentPct }));
    const targetDonut = itemsWithPct.map(p => ({ name: p.name, value: p.targetPct, color: p.color, pct: p.targetPct }));

    return { items: itemsWithPct, sources, destinations, flows, currentDonut, targetDonut };
  }, [activePlatforms, platforms]);

  const momMap = useMemo(() => {
    const m = new Map<number, number>();
    if (platformMomData) for (const d of platformMomData) m.set(d.platformId, d.momGrowthPercent);
    return m;
  }, [platformMomData]);

  const tableData = useMemo(() => {
    if (!activePlatforms) return [];
    const totalCurrent = (platforms ?? activePlatforms).reduce((s, p) => s + (Number(p.currentValue) || 0), 0);
    return activePlatforms.map(p => {
      const invested = Number(p.totalInvested) || 0;
      const current = Number(p.currentValue) || 0;
      const pnl = current - invested;
      const roi = invested > 0 ? (pnl / invested) * 100 : 0;
      const mom = momMap.has(p.id) ? momMap.get(p.id)! : null;
      const target = p.targetAllocation != null ? Number(p.targetAllocation) : null;
      const actual = totalCurrent > 0 ? (current / totalCurrent) * 100 : 0;
      const delta = target != null ? actual - target : null;
      return { ...p, invested, current, pnl, roi, mom, target, actual, delta };
    });
  }, [activePlatforms, platforms, momMap]);

  const sortedTable = useMemo(() => {
    const copy = [...tableData];
    copy.sort((a, b) => {
      if (sortKey === "name") {
        return sortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      const av = { invested: a.invested, current: a.current, pnl: a.pnl, roi: a.roi, mom: a.mom ?? -Infinity, target: a.target ?? -Infinity, delta: a.delta ?? -Infinity, name: 0 }[sortKey];
      const bv = { invested: b.invested, current: b.current, pnl: b.pnl, roi: b.roi, mom: b.mom ?? -Infinity, target: b.target ?? -Infinity, delta: b.delta ?? -Infinity, name: 0 }[sortKey];
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return copy;
  }, [tableData, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function SortIndicator({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="text-muted-foreground/40 ml-1">↕</span>;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  // ── Dashboard computed ───────────────────────────────────────────────────
  const statsData = history && history.length > 0 ? history[history.length - 1] : { value: 0, invested: 0 };
  const totalValue = statsData.value;
  const totalInvested = statsData.invested;
  const netProfit = totalValue - totalInvested;
  const roi = totalInvested > 0 ? (netProfit / totalInvested) * 100 : 0;

  const formatAxisValue = (value: number, showSign: boolean = false) => {
    const symbol = getCurrencySymbol(currency);
    const sign = showSign && value >= 0 ? '+' : '';
    const absValue = Math.abs(value);
    if (absValue >= 1000000) return `${sign}${symbol}${(value / 1000000).toFixed(1)}M`;
    if (absValue >= 1000) return `${sign}${symbol}${(value / 1000).toFixed(1)}k`;
    if (absValue >= 1) return `${sign}${symbol}${value.toFixed(0)}`;
    return `${sign}${symbol}${value.toFixed(2)}`;
  };

  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const d = payload[0]?.payload;

    // Per-platform breakdown for Monthly Growth view
    const isMonthlyView = displayedChartView === "monthly" ||
      (displayedChartView === "all" && payload.some((e: any) => e.dataKey === "monthlyChange" || e.dataKey === "monthlyChangePct"));
    const monthlyPlatformRows = (() => {
      if (!isMonthlyView) return null;
      // Prefer inline platformBreakdown (present on monthlySeriesData points — sums to headline)
      if (d?.platformBreakdown) {
        return (d.platformBreakdown as PlatformGain[])
          .filter(p => Math.abs(p.gain) > 0.005)
          .sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain));
      }
      // Fallback: ymKey lookup from heatmap data (used for "all" view which still uses mappedData)
      // Skip lookup for aggregated period keys like "2025-Q1" or "2025" — they are not valid dates
      if (!d?.date || !platformBreakdownByMonth) return null;
      if (typeof d.date === 'string' && (d.date.includes('-Q') || /^\d{4}$/.test(d.date))) return null;
      const ymKey = format(new Date(d.date), 'yyyy-MM');
      const entries = platformBreakdownByMonth[ymKey]?.filter(p => !excludedPlatforms.has(p.platformId));
      if (!entries || entries.length === 0) return null;
      return entries
        .filter(p => Math.abs(p.gain) > 0.005)
        .sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain));
    })();

    // Format the tooltip header label — handle aggregated period keys ("2025-Q1", "2025") gracefully
    const fmtTooltipLabel = (l: unknown): string => {
      if (typeof l === 'number') { try { return format(new Date(l), 'MMM dd, yyyy'); } catch { return String(l); } }
      if (!l || typeof l !== 'string') return String(l ?? '');
      if (l.includes('-Q')) { const [y, q] = l.split('-'); return `${q} '${y.slice(2)}`; }
      if (/^\d{4}$/.test(l)) return l;
      try { return format(new Date(l), 'MMM dd, yyyy'); } catch { return l; }
    };

    return (
      <div className="rounded-xl border border-border bg-card shadow-lg px-4 py-3 text-sm min-w-[220px]">
        <p className="font-semibold text-foreground mb-2">{fmtTooltipLabel(label)}</p>
        {payload.map((entry: any) => {
          const isPct = entry.dataKey === 'gainPct' || entry.dataKey === 'monthlyChangePct';
          const isSigned = entry.dataKey === 'monthlyChange' || entry.dataKey === 'gain' || isPct;
          const deltaKey = entry.dataKey === 'value' ? 'valueChange'
            : entry.dataKey === 'invested' ? 'investedChange'
            : entry.dataKey === 'gain' ? 'gainChange'
            : null;
          const delta = deltaKey ? d?.[deltaKey] : null;
          return (
            <div key={entry.dataKey} className="flex items-center justify-between gap-6 py-0.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                <span className="text-muted-foreground">{entry.name}</span>
              </div>
              <div className="text-right">
                <span className="font-semibold text-foreground">
                  {isPct
                    ? fmtPct(entry.value)
                    : isSigned
                      ? `${entry.value >= 0 ? '+' : ''}${formatCurrency(entry.value, currency)}`
                      : formatCurrency(entry.value, currency)}
                </span>
                {delta != null && delta !== 0 && (
                  <span className={cn("ml-2 text-xs font-medium", delta >= 0 ? "text-emerald-500" : "text-rose-500")}>
                    {delta >= 0 ? '+' : ''}{formatCurrency(delta, currency)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {monthlyPlatformRows && monthlyPlatformRows.length > 0 && (
          <>
            <div className="border-t border-border mt-2 pt-2 space-y-0.5">
              {monthlyPlatformRows.map(p => (
                <div key={p.platformId} className="flex items-center justify-between gap-4 py-0.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                    <span className="text-muted-foreground text-xs truncate">{p.name}</span>
                  </div>
                  <span className={cn("text-xs font-semibold shrink-0", p.gain >= 0 ? "text-emerald-500" : "text-rose-500")}>
                    {displayedChartValueMode === "pct"
                      ? (p.gainPct != null ? fmtPct(p.gainPct) : "—")
                      : `${p.gain >= 0 ? '+' : ''}${formatCurrency(p.gain, currency)}`}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  // ── Loading state ────────────────────────────────────────────────────────
  if (isPlatformsLoading || isHistoryLoading) {
    return (
      <Layout>
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
          <Skeleton className="h-[400px] rounded-xl" />
        </div>
      </Layout>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="flex items-start gap-6 pb-12">

        {/* ── Main content ─────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">Dashboard</h1>
              <p className="text-muted-foreground">Your financial overview at a glance.</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Button
                data-testid="button-scrape-all"
                onClick={() => scrapeAllMutation.mutate()}
                disabled={scrapeAllMutation.isPending}
                variant="outline"
              >
                {scrapeAllMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                {scrapeAllMutation.isPending ? "Scraping..." : "Scrape All"}
              </Button>
              {scraperConfigs && scraperConfigs.length > 0 && (
                <span className="text-xs text-muted-foreground" data-testid="text-last-scrape-time">
                  {lastScrapeAt
                    ? `Last scraped ${formatDistanceToNow(lastScrapeAt, { addSuffix: true })}`
                    : "Never scraped"}
                </span>
              )}
            </div>
          </div>

          {/* Scrape log */}
          {(scrapeLogOpen && scrapeLog !== null) && (
            <Card data-testid="card-scrape-log">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 py-3 px-4">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-medium">
                    {scrapeAllMutation.isPending ? "Scraping in progress..." : "Scrape Results"}
                  </CardTitle>
                  {!scrapeAllMutation.isPending && scrapeLog.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {scrapeLog.filter(r => r.success).length} succeeded, {scrapeLog.filter(r => !r.success).length} failed
                    </span>
                  )}
                </div>
                <Button variant="ghost" size="icon" onClick={() => setScrapeLogOpen(false)} data-testid="button-close-scrape-log">
                  <X className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0">
                <div ref={scrapeLogRef} className="max-h-48 overflow-y-auto space-y-1">
                  {scrapeAllMutation.isPending && scrapeLog.length === 0 && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Connecting to scrapers...</span>
                    </div>
                  )}
                  {scrapeLog.map((entry, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-sm py-1" data-testid={`scrape-log-entry-${idx}`}>
                      {entry.message === "Scraping..." ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-0.5 shrink-0" />
                      ) : entry.success ? (
                        <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                      )}
                      <div>
                        <span className="font-medium">{entry.platformName}</span>
                        <span className="text-muted-foreground ml-2">{entry.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard
              title="Total Portfolio Value"
              value={formatCurrencyRounded(totalValue, currency)}
              icon={Wallet}
              className="border-l-primary"
              platformBreakdown={(activePlatforms || []).map(p => {
                const val = Number(p.currentValue) || 0;
                const pct = totalValue > 0 ? (val / totalValue) * 100 : 0;
                return { name: p.name, value: formatCurrency(val, currency), percent: `${pct.toFixed(1)}%`, iconUrl: (p as any).customIconUrl, sortValue: val };
              })}
              data-testid="stat-total-value"
            />
            <StatCard
              title="Total Invested"
              value={formatCurrencyRounded(totalInvested, currency)}
              icon={DollarSign}
              className="border-l-blue-500"
              platformBreakdown={(activePlatforms || []).map(p => {
                const inv = Number(p.totalInvested) || 0;
                const pct = totalInvested > 0 ? (inv / totalInvested) * 100 : 0;
                return { name: p.name, value: formatCurrency(inv, currency), percent: `${pct.toFixed(1)}%`, iconUrl: (p as any).customIconUrl, sortValue: inv };
              })}
              data-testid="stat-total-invested"
            />
            <StatCard
              title="Net Profit / Loss"
              value={formatCurrencyRounded(Math.abs(netProfit), currency)}
              trend={netProfit >= 0 ? "up" : "down"}
              trendValue={`${roi.toFixed(2)}%`}
              icon={TrendingUp}
              className={netProfit >= 0 ? "border-l-emerald-500" : "border-l-rose-500"}
              platformBreakdown={(activePlatforms || []).map(p => {
                const invested = Number(p.totalInvested) || 0;
                const value = Number(p.currentValue) || 0;
                const profit = value - invested;
                const r = invested > 0 ? (profit / invested) * 100 : 0;
                return { name: p.name, value: `${profit >= 0 ? '+' : ''}${formatCurrency(profit, currency)}`, percent: `${r >= 0 ? '+' : ''}${r.toFixed(1)}%`, iconUrl: (p as any).customIconUrl, sortValue: profit };
              })}
              data-testid="stat-net-profit"
            />
            <KpiCard
              label="Ann. Return"
              value={kpis?.cagr != null ? fmtPct(kpis.cagr) : "—"}
              sub={kpis?.twr != null ? `${fmtPct(kpis.twr)} cumulative · cash-flow adjusted` : "Time-weighted, annualized"}
              icon={<TrendingUp className="w-5 h-5 text-muted-foreground" />}
              positive={kpis?.cagr != null ? kpis.cagr >= 0 : undefined}
            />
            <Card className={cn("hover:shadow-lg transition-all duration-300 border-l-4", rollingReturns ? (rollingReturns.d30.change >= 0 ? "border-l-emerald-500" : "border-l-rose-500") : "border-l-muted")} data-testid="stat-rolling-returns">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Performance</CardTitle>
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pt-0">
                <table className="w-full text-xs">
                  <tbody>
                    {(["7d", "30d", "90d"] as const).map((label) => {
                      const key = label === "7d" ? "d7" : label === "30d" ? "d30" : "d90";
                      const w = rollingReturns?.[key];
                      const platforms = platformRollingReturns?.[key]
                        ?.slice()
                        .sort((a, b) => b.change - a.change);
                      return (
                        <UITooltip key={label}>
                          <TooltipTrigger asChild>
                            <tr className="border-b border-border/40 last:border-0 cursor-default hover:bg-muted/30 transition-colors">
                              <td className="py-1 pr-2 text-muted-foreground font-medium w-8">{label}</td>
                              <td className={cn("py-1 pr-2 font-semibold tabular-nums text-right", !w ? "text-muted-foreground" : w.change >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                                {!w ? "—" : `${w.change >= 0 ? "+" : ""}${formatCurrencyRounded(w.change, currency)}`}
                              </td>
                              <td className={cn("py-1 text-right tabular-nums", !w ? "text-muted-foreground" : w.pct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                                {!w ? "—" : `${w.pct >= 0 ? "+" : ""}${w.pct.toFixed(2)}%`}
                              </td>
                            </tr>
                          </TooltipTrigger>
                          <TooltipContent side="left" sideOffset={8} className="p-3 w-64">
                            <p className="text-xs font-semibold mb-2 text-foreground">{label} platform breakdown</p>
                            {platforms && platforms.length > 0 ? (
                              <div className="space-y-1">
                                {platforms.map((p) => (
                                  <div key={p.platformId} className="flex items-center justify-between gap-2 text-xs">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                                      <span className="truncate text-muted-foreground">{p.name}</span>
                                    </div>
                                    <div className="flex gap-2 tabular-nums flex-shrink-0 font-medium">
                                      <span className={p.change >= 0 ? "text-emerald-500 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400"}>
                                        {p.change >= 0 ? "+" : ""}{formatCurrencyRounded(p.change, currency)}
                                      </span>
                                      <span className={cn("text-muted-foreground", p.pct >= 0 ? "text-emerald-500/70 dark:text-emerald-400/70" : "text-rose-500/70 dark:text-rose-400/70")}>
                                        {p.pct >= 0 ? "+" : ""}{p.pct.toFixed(2)}%
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">Loading…</p>
                            )}
                          </TooltipContent>
                        </UITooltip>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          {/* Portfolio Performance Chart */}
          <Card className="shadow-md">
            <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle>Portfolio Performance</CardTitle>
                <CardDescription>Invested amount vs. current valuation over time</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(range === "year" || range.startsWith("year-")) && (
                  <Select value={specificYear || (range.startsWith("year-") ? range.split("-")[1] : "")} onValueChange={(val) => {
                    setRange(`year-${val}`);
                    setSpecificYear(val);
                  }}>
                    <SelectTrigger className="w-[100px] h-9">
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((y: string) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {(range === "month" || range.startsWith("month-")) && (
                  <div className="flex gap-2">
                    <Select value={specificYear || (range.startsWith("month-") ? range.split("-")[1] : currentYear)} onValueChange={val => setSpecificYear(val)}>
                      <SelectTrigger className="w-[100px] h-9"><SelectValue placeholder="Year" /></SelectTrigger>
                      <SelectContent>
                        {years.map((y: string) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={specificMonth || (range.startsWith("month-") ? range.split("-")[2] : "")} onValueChange={val => {
                      const year = specificYear || (range.startsWith("month-") ? range.split("-")[1] : currentYear);
                      setRange(`month-${year}-${val}`);
                      setSpecificMonth(val);
                    }}>
                      <SelectTrigger className="w-[120px] h-9"><SelectValue placeholder="Month" /></SelectTrigger>
                      <SelectContent>
                        {monthsData.filter((m: any) => m.year === (specificYear || (range.startsWith("month-") ? range.split("-")[1] : currentYear))).map((m: any) => (
                          <SelectItem key={`${m.year}-${m.value}`} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Tabs value={range.startsWith("year-") ? "year" : range.startsWith("month-") ? "month" : range} onValueChange={val => {
                  setRange(val);
                  setSpecificYear(null);
                  setSpecificMonth(null);
                }} className="w-auto">
                  <TabsList>
                    <TabsTrigger value="quarter">3M</TabsTrigger>
                    <TabsTrigger value="year">1Y</TabsTrigger>
                    <TabsTrigger value="all">ALL</TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="flex items-center border rounded-md overflow-hidden">
                  <button
                    onClick={() => setChartType("line")}
                    className={cn("px-2 py-1.5 transition-colors", chartType === "line" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")}
                    data-testid="button-chart-type-line"
                  >
                    <LineChartIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setChartType("bar")}
                    className={cn("px-2 py-1.5 transition-colors", chartType === "bar" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")}
                    data-testid="button-chart-type-bar"
                  >
                    <BarChart2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <Tabs value={chartView} onValueChange={v => setChartView(v as any)}>
                  <TabsList>
                    <TabsTrigger value="overview" data-testid="tab-chart-overview">Value Overview</TabsTrigger>
                    <TabsTrigger value="profit" data-testid="tab-chart-profit">Profit/Loss</TabsTrigger>
                    <TabsTrigger value="monthly" data-testid="tab-chart-monthly">Monthly Growth</TabsTrigger>
                    <TabsTrigger value="all" data-testid="tab-chart-all">All</TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center border rounded-md overflow-hidden text-xs font-medium">
                    <button onClick={() => setChartAggregation("month")} className={cn("px-2.5 py-1.5 transition-colors", chartAggregation === "month" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")} data-testid="button-agg-month">Mo</button>
                    <button onClick={() => setChartAggregation("quarter")} className={cn("px-2.5 py-1.5 transition-colors", chartAggregation === "quarter" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")} data-testid="button-agg-quarter">Qtr</button>
                    <button onClick={() => setChartAggregation("year")} className={cn("px-2.5 py-1.5 transition-colors", chartAggregation === "year" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")} data-testid="button-agg-year">Yr</button>
                  </div>
                  {chartView !== "overview" && (
                    <div className="flex items-center border rounded-md overflow-hidden text-xs font-medium">
                      <button onClick={() => setChartValueMode("value")} className={cn("px-2.5 py-1.5 transition-colors", chartValueMode === "value" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")} data-testid="button-chart-mode-value">
                        {getCurrencySymbol(currency)}
                      </button>
                      <button onClick={() => setChartValueMode("pct")} className={cn("px-2.5 py-1.5 transition-colors", chartValueMode === "pct" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")} data-testid="button-chart-mode-pct">
                        %
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className={cn("h-[400px] w-full transition-opacity duration-150", chartFading ? "opacity-0" : "opacity-100")}>
                {(chartData && chartData.length > 0) || (displayedChartView === "monthly" && monthlySeriesData.length > 0) ? (() => {
                  const mappedData = chartData.map((h: any, i: number, arr: any[]) => {
                    const prev = arr[i - 1];
                    const totalChange = i === 0 ? 0 : (h.value - prev.value) - (h.invested - prev.invested);
                    const gain = h.value - h.invested;
                    const gainPct = h.invested > 0 ? (gain / h.invested) * 100 : 0;
                    const monthlyChangePct = (i > 0 && prev.value > 0) ? (totalChange / prev.value) * 100 : 0;
                    return {
                      ...h,
                      timestamp: new Date(h.date).getTime(),
                      gain,
                      gainPct,
                      monthlyChange: totalChange,
                      monthlyChangePct,
                      valueChange: i === 0 ? null : h.value - prev.value,
                      investedChange: i === 0 ? null : h.invested - prev.invested,
                      gainChange: i === 0 ? null : (h.value - h.invested) - (prev.value - prev.invested),
                      baseAmount: Math.min(h.value, h.invested),
                      gainPortion: Math.max(0, gain),
                      lostPortion: Math.max(0, -gain),
                    };
                  });

                  const commonXAxis = (
                    <XAxis
                      dataKey="timestamp"
                      type="number"
                      scale="time"
                      domain={['dataMin', 'dataMax']}
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(ts) => format(new Date(ts), 'MMM yy')}
                      ticks={(() => {
                        const seen = new Set<string>();
                        return chartData.filter((entry: any) => {
                          const key = format(new Date(entry.date), 'yyyy-MM');
                          if (seen.has(key)) return false;
                          seen.add(key);
                          return true;
                        }).map((entry: any) => new Date(entry.date).getTime());
                      })()}
                    />
                  );

                  const profitKey = displayedChartValueMode === "pct" ? "gainPct" : "gain";
                  const monthlyKey = displayedChartValueMode === "pct" ? "monthlyChangePct" : "monthlyChange";
                  const profitAxisFmt = (v: number) => displayedChartValueMode === "pct" ? fmtPct(v) : formatAxisValue(v, true);
                  const monthlyAxisFmt = (v: number) => displayedChartValueMode === "pct" ? fmtPct(v) : formatAxisValue(v, true);

                  // ── Aggregated overview/profit/all: use end-of-period snapshots ─────
                  if (displayedChartAggregation !== "month" && aggregatedChartData && displayedChartView !== "monthly") {
                    const aggXFmt2 = (d: string) => {
                      if (displayedChartAggregation === "quarter") {
                        const [y, q] = d.split("-");
                        return `${q} '${y.slice(2)}`;
                      }
                      if (displayedChartAggregation === "year") return d;
                      return d;
                    };
                    const profitKeyAgg = displayedChartValueMode === "pct" ? "gainPct" : "gain";
                    if (displayedChartType === "bar") {
                      return (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={aggregatedChartData} barCategoryGap="20%">
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <XAxis dataKey="date" type="category" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={aggXFmt2} interval="preserveStartEnd" />
                            {(displayedChartView === "overview" || displayedChartView === "all") && <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => formatAxisValue(v)} domain={[0, 'auto']} />}
                            {displayedChartView === "profit" && <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={profitAxisFmt} domain={['auto', 'auto']} />}
                            {displayedChartView === "all" && <YAxis yAxisId="right" orientation="right" stroke="#10b981" fontSize={12} tickLine={false} axisLine={false} tickFormatter={profitAxisFmt} domain={['auto', 'auto']} />}
                            <Tooltip content={<ChartTooltip />} />
                            <Legend verticalAlign="top" height={36} />
                            {(displayedChartView === "overview" || displayedChartView === "all") && <>
                              <Bar dataKey="value" name="Current Value" stackId="ov" yAxisId="left" fill="hsl(var(--primary))" animationDuration={350} radius={[3, 3, 0, 0]} />
                              <Bar dataKey="invested" name="Invested" stackId="ov2" yAxisId="left" fill="#3b82f6" animationDuration={350} />
                            </>}
                            {(displayedChartView === "profit" || displayedChartView === "all") && (
                              <Bar dataKey={profitKeyAgg} name="Profit/Loss" yAxisId={displayedChartView === "all" ? "right" : "left"} animationDuration={350} radius={[3, 3, 3, 3]}>
                                {aggregatedChartData.map((entry: any, i: number) => <Cell key={i} fill={entry.gain >= 0 ? '#10b981' : '#ef4444'} />)}
                              </Bar>
                            )}
                          </BarChart>
                        </ResponsiveContainer>
                      );
                    }
                    return (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={aggregatedChartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" type="category" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={aggXFmt2} interval="preserveStartEnd" />
                          {(displayedChartView === "overview" || displayedChartView === "all") && <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => formatAxisValue(v)} domain={['auto', 'auto']} />}
                          {(displayedChartView === "profit" || displayedChartView === "all") && <YAxis yAxisId="right" orientation="right" stroke="#10b981" fontSize={12} tickLine={false} axisLine={false} tickFormatter={profitAxisFmt} domain={['auto', 'auto']} />}
                          <Tooltip content={<ChartTooltip />} />
                          <Legend verticalAlign="top" height={36} />
                          {(displayedChartView === "overview" || displayedChartView === "all") && <>
                            <Line type="monotone" dataKey="value" name="Current Value" yAxisId="left" stroke="hsl(var(--primary))" strokeWidth={4} dot={{ r: 4, fill: 'hsl(var(--primary))', strokeWidth: 0 }} activeDot={{ r: 6 }} animationDuration={350} />
                            <Line type="monotone" dataKey="invested" name="Invested" yAxisId="left" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }} animationDuration={350} />
                          </>}
                          {(displayedChartView === "profit" || displayedChartView === "all") && (
                            <Line type="monotone" dataKey={profitKeyAgg} name="Profit/Loss" yAxisId="right" stroke="#10b981" strokeWidth={2} dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }} activeDot={{ r: 5 }} animationDuration={350} />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    );
                  }

                  // ── Monthly Growth: use heatmap-aligned series, with optional aggregation ─
                  if (displayedChartView === "monthly") {
                    if (aggregatedSeriesData.length === 0) {
                      return (
                        <div className="h-full flex items-center justify-center text-muted-foreground">
                          No data available for this range.
                        </div>
                      );
                    }
                    const aggXFmt = (d: string) => {
                      if (displayedChartAggregation === "quarter") {
                        const [y, q] = d.split("-");
                        return `${q} '${y.slice(2)}`;
                      }
                      if (displayedChartAggregation === "year") return d;
                      return format(new Date(d), 'MMM yy');
                    };
                    const aggSeriesName = displayedChartAggregation === "quarter"
                      ? "Avg Monthly (Qtr)"
                      : displayedChartAggregation === "year"
                        ? "Avg Monthly (Yr)"
                        : "Monthly Growth";
                    if (displayedChartType === "bar") {
                      return (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={aggregatedSeriesData} barCategoryGap="20%">
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <XAxis dataKey="date" type="category" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={aggXFmt} interval="preserveStartEnd" />
                            <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={monthlyAxisFmt} domain={['auto', 'auto']} />
                            <Tooltip content={<ChartTooltip />} />
                            <Legend verticalAlign="top" height={36} />
                            <Bar dataKey={monthlyKey} name={aggSeriesName} yAxisId="left" animationDuration={350} radius={[3, 3, 3, 3]}>
                              {aggregatedSeriesData.map((entry, i) => <Cell key={i} fill={entry.monthlyChange >= 0 ? '#10b981' : '#ef4444'} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      );
                    }
                    return (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={aggregatedSeriesData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" type="category" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={aggXFmt} interval="preserveStartEnd" />
                          <YAxis yAxisId="monthly" stroke="#f59e0b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={monthlyAxisFmt} domain={['auto', 'auto']} />
                          <Tooltip content={<ChartTooltip />} />
                          <Legend verticalAlign="top" height={36} />
                          <Line type="monotone" dataKey={monthlyKey} name={aggSeriesName} yAxisId="monthly" stroke="#f59e0b" strokeWidth={2} dot={{ r: 5, fill: '#f59e0b', strokeWidth: 0 }} activeDot={{ r: 7 }} animationDuration={350} />
                        </LineChart>
                      </ResponsiveContainer>
                    );
                  }

                  if (displayedChartType === "bar") {
                    return (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={mappedData} barCategoryGap="20%">
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" type="category" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={d => format(new Date(d), 'MMM yy')} interval="preserveStartEnd" />
                          {(displayedChartView === "overview" || displayedChartView === "all") && (
                            <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={value => formatAxisValue(value)} domain={[0, 'auto']} />
                          )}
                          {displayedChartView === "profit" && (
                            <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={profitAxisFmt} domain={['auto', 'auto']} />
                          )}
                          <Tooltip content={<ChartTooltip />} />
                          <Legend verticalAlign="top" height={36} />
                          {(displayedChartView === "overview" || displayedChartView === "all") && (
                            <>
                              <Bar dataKey="baseAmount" name="Invested" stackId="stack" yAxisId="left" fill="#3b82f6" animationDuration={350} />
                              <Bar dataKey="gainPortion" name="Profit" stackId="stack" yAxisId="left" animationDuration={350} radius={[3, 3, 0, 0]}>
                                {mappedData.map((_: any, i: number) => <Cell key={i} fill="#10b981" />)}
                              </Bar>
                              <Bar dataKey="lostPortion" name="Loss" stackId="stack" yAxisId="left" animationDuration={350} radius={[3, 3, 0, 0]}>
                                {mappedData.map((_: any, i: number) => <Cell key={i} fill="#ef4444" />)}
                              </Bar>
                            </>
                          )}
                          {displayedChartView === "profit" && (
                            <Bar dataKey={profitKey} name="Profit/Loss" yAxisId="left" animationDuration={350} radius={[3, 3, 3, 3]}>
                              {mappedData.map((entry: any, i: number) => <Cell key={i} fill={entry.gain >= 0 ? '#10b981' : '#ef4444'} />)}
                            </Bar>
                          )}
                        </BarChart>
                      </ResponsiveContainer>
                    );
                  }

                  return (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={mappedData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        {commonXAxis}
                        {(displayedChartView === "overview" || displayedChartView === "all") && (
                          <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={value => formatAxisValue(value)} domain={['auto', 'auto']} />
                        )}
                        {(displayedChartView === "profit" || displayedChartView === "all") && (
                          <YAxis yAxisId="right" orientation="right" stroke="#10b981" fontSize={12} tickLine={false} axisLine={false} tickFormatter={profitAxisFmt} domain={['auto', 'auto']} />
                        )}
                        {displayedChartView === "all" && (
                          <YAxis yAxisId="monthly" orientation="right" stroke="#f59e0b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={monthlyAxisFmt} domain={['auto', 'auto']} />
                        )}
                        <Tooltip content={<ChartTooltip />} />
                        <Legend verticalAlign="top" height={36} />
                        {(displayedChartView === "overview" || displayedChartView === "all") && (
                          <>
                            <Line type="monotone" dataKey="value" name="Current Value" yAxisId="left" stroke="hsl(var(--primary))" strokeWidth={4} dot={false} activeDot={{ r: 6 }} animationDuration={350} />
                            <Line type="monotone" dataKey="invested" name="Invested" yAxisId="left" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={{ r: 4 }} animationDuration={350} />
                          </>
                        )}
                        {(displayedChartView === "profit" || displayedChartView === "all") && (
                          <Line type="monotone" dataKey={profitKey} name="Profit/Loss" yAxisId="right" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4 }} animationDuration={350} />
                        )}
                        {displayedChartView === "all" && (
                          <Line type="monotone" dataKey={monthlyKey} name="Monthly Growth" yAxisId="monthly" stroke="#f59e0b" strokeWidth={2} dot={{ r: 5, fill: '#f59e0b', strokeWidth: 0 }} activeDot={{ r: 7 }} animationDuration={350} />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  );
                })() : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    No portfolio history available.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Combined Heatmaps */}
          <Card data-testid="heatmaps-card">
            <CardHeader className="pb-0">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle>Heatmaps</CardTitle>
                  <CardDescription>Monthly calendar returns and portfolio breakdown in one place · based on 10th-to-10th of month snapshots</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <Tabs defaultValue="monthly" onValueChange={setActiveHeatmapTab}>
                <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
                  <TabsList>
                    <TabsTrigger value="monthly" data-testid="heatmap-tab-monthly">Monthly Calendar</TabsTrigger>
                    <TabsTrigger value="portfolio" data-testid="heatmap-tab-portfolio">Portfolio Breakdown</TabsTrigger>
                  </TabsList>
                  {activeHeatmapTab === "monthly" && (
                    <div className="flex items-center rounded-md border p-0.5 shrink-0">
                      <button type="button" onClick={() => setHeatmapMode("pct")} className={cn("px-2.5 py-1 text-xs font-medium rounded transition-colors", heatmapMode === "pct" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")} data-testid="heatmap-toggle-pct">%</button>
                      <button type="button" onClick={() => setHeatmapMode("value")} className={cn("px-2.5 py-1 text-xs font-medium rounded transition-colors", heatmapMode === "value" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")} data-testid="heatmap-toggle-value">{getCurrencySymbol(currency)}</button>
                    </div>
                  )}
                </div>

                <TabsContent value="monthly">
                  {activeHeatmapData ? (
                    <div className="overflow-x-auto">
                      <div className="min-w-[600px]">
                        <div className="flex mb-1">
                          <div className="w-12 shrink-0" />
                          {MONTHS.map(m => (
                            <div key={m} className="flex-1 text-center text-xs text-muted-foreground font-medium">{m}</div>
                          ))}
                        </div>
                        {activeHeatmapData.years.map(year => (
                          <div key={year} className="flex items-center mb-1">
                            <div className="w-12 shrink-0 text-xs text-muted-foreground font-medium pr-2 text-right">{year}</div>
                            {Array.from({ length: 12 }, (_, mi) => {
                              const monthNum = mi + 1;
                              const cell = activeHeatmapData.cells.find(c => c.year === year && c.month === monthNum);
                              if (!cell) return <div key={monthNum} className="flex-1 mx-0.5 h-10 rounded bg-muted/30" />;
                              const intensity = Math.min(Math.abs(cell.returnPct) / 5, 1);
                              const bg = cell.returnPct >= 0
                                ? `rgba(16,185,129,${0.15 + intensity * 0.75})`
                                : `rgba(239,68,68,${0.15 + intensity * 0.75})`;
                              const label = `${MONTHS[monthNum - 1]} ${year}`;
                              return (
                                <div
                                  key={monthNum}
                                  className="flex-1 mx-0.5 h-10 rounded flex items-center justify-center text-[10px] font-medium cursor-default transition-transform hover:scale-105"
                                  style={{ backgroundColor: bg, color: intensity > 0.5 ? "#fff" : undefined }}
                                  data-testid={`heatmap-cell-${year}-${monthNum}`}
                                  onMouseEnter={e => {
                                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                                    const ymKey = `${year}-${String(monthNum).padStart(2, "0")}`;
                                    setTooltip({
                                      x: rect.left + rect.width / 2,
                                      y: rect.top,
                                      data: {
                                        label,
                                        returnPct: cell.returnPct,
                                        absoluteChange: cell.absoluteChange,
                                        currency,
                                        platformBreakdown: platformBreakdownByMonth?.[ymKey]?.filter(p => !excludedPlatforms.has(p.platformId)),
                                      },
                                    });
                                  }}
                                  onMouseLeave={() => setTooltip(null)}
                                >
                                  {heatmapMode === "pct" ? fmtPct(cell.returnPct) : formatCompactCurrency(cell.absoluteChange, currency)}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">Not enough history data to build heatmap.</p>
                  )}
                  {tooltip && (
                    <div className="fixed z-50 pointer-events-none" style={{ left: tooltip.x, top: tooltip.y - 8, transform: "translate(-50%, -100%)" }}>
                      <HeatmapTooltipCard {...tooltip.data} />
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="portfolio">
                  {platforms && (
                    <PortfolioHeatmap
                      assets={analyticsAssets ?? []}
                      platforms={platforms}
                      excludedPlatforms={excludedPlatforms}
                      currency={currency}
                    />
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Portfolio Rebalancer */}
          <Card>
            <CardHeader>
              <CardTitle>Portfolio Rebalancer</CardTitle>
              <CardDescription>Current vs target allocation — and exactly where to move capital to rebalance</CardDescription>
            </CardHeader>
            <CardContent>
              {rebalancerData ? (
                <div className="space-y-8">
                  <div className="h-[280px]" data-testid="rebalancer-alloc-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[...rebalancerData.items].sort((a, b) => b.targetPct - a.targetPct).map(item => {
                          const over = item.currentPct > item.targetPct;
                          return {
                            name: item.name,
                            currentPct: item.currentPct,
                            targetPct: item.targetPct,
                            green: over ? item.targetPct : item.currentPct,
                            gray: over ? 0 : item.targetPct - item.currentPct,
                            red: over ? item.currentPct - item.targetPct : 0,
                          };
                        })}
                        margin={{ top: 4, right: 8, bottom: 40, left: 8 }}
                        barCategoryGap="30%"
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} angle={-35} textAnchor="end" interval={0} />
                        <YAxis tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={36} />
                        <Tooltip
                          cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0]?.payload as { name: string; currentPct: number; targetPct: number } | undefined;
                            if (!d) return null;
                            const delta = d.currentPct - d.targetPct;
                            const sign = delta >= 0 ? "+" : "";
                            return (
                              <div style={{ borderRadius: 8, background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", padding: "8px 12px", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                                <p style={{ fontWeight: 600, marginBottom: 4 }}>{d.name}</p>
                                <p>Current: <strong>{d.currentPct.toFixed(1)}%</strong></p>
                                <p>Target: <strong>{d.targetPct.toFixed(1)}%</strong></p>
                                <p style={{ color: delta > 0 ? "#ef4444" : delta < 0 ? "#10b981" : "inherit" }}>
                                  Delta: <strong>{sign}{delta.toFixed(1)}%</strong>
                                </p>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="green" stackId="alloc" fill="#10b981" isAnimationActive={false} />
                        <Bar dataKey="gray" stackId="alloc" fill="#d1d5db" isAnimationActive={false} />
                        <Bar dataKey="red" stackId="alloc" fill="#ef4444" isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block bg-emerald-500" />Achieved</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block bg-gray-300" />Gap to target</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block bg-red-500" />Over target</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2">
                    {rebalancerData.items.map(item => (
                      <div key={item.id} className="flex items-center gap-2 min-w-0" data-testid={`legend-item-${item.id}`}>
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="text-xs text-muted-foreground truncate">{item.name}</span>
                        <span className="text-xs font-medium ml-auto shrink-0">{item.currentPct.toFixed(1)}% / {item.targetPct.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t pt-6 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-semibold text-red-500 mb-3">Over-Allocated</p>
                        {rebalancerData.sources.length === 0 ? (
                          <p className="text-xs text-muted-foreground">All platforms are at or below their target.</p>
                        ) : (
                          <div className="space-y-2">
                            {rebalancerData.sources.map(p => (
                              <div key={p.id} className="flex items-center gap-2" data-testid={`over-item-${p.id}`}>
                                <PlatformIcon icon={p.icon} customIconUrl={p.customIconUrl} color={p.color} name={p.name} size="sm" />
                                <span className="text-sm flex-1 truncate">{p.name}</span>
                                <span className="text-sm font-semibold text-red-500 shrink-0">+{formatCurrency(p.surplus, currency)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-emerald-500 mb-3">Under-Allocated</p>
                        {rebalancerData.destinations.length === 0 ? (
                          <p className="text-xs text-muted-foreground">All platforms are at or above their target.</p>
                        ) : (
                          <div className="space-y-2">
                            {rebalancerData.destinations.map(p => (
                              <div key={p.id} className="flex items-center gap-2" data-testid={`under-item-${p.id}`}>
                                <PlatformIcon icon={p.icon} customIconUrl={p.customIconUrl} color={p.color} name={p.name} size="sm" />
                                <span className="text-sm flex-1 truncate">{p.name}</span>
                                <span className="text-sm font-semibold text-emerald-500 shrink-0">−{formatCurrency(Math.abs(p.surplus), currency)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[200px] gap-3 text-center">
                  <Target className="w-10 h-10 text-muted-foreground/40" />
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">No allocation targets set</p>
                    <p className="text-muted-foreground/70 text-xs mt-1">Set target allocations in the Platform Performance section above to see the rebalancer.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Monthly Investment Flow */}
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap pb-2">
              <div>
                <CardTitle>Investment Flow</CardTitle>
                <CardDescription>Net new capital deployed, broken down by platform</CardDescription>
              </div>
              <div className="flex items-center border rounded-md overflow-hidden text-xs font-medium">
                <button onClick={() => setFlowAggregation("month")} className={cn("px-2.5 py-1.5 transition-colors", flowAggregation === "month" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")} data-testid="button-flow-agg-month">Mo</button>
                <button onClick={() => setFlowAggregation("quarter")} className={cn("px-2.5 py-1.5 transition-colors", flowAggregation === "quarter" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")} data-testid="button-flow-agg-quarter">Qtr</button>
                <button onClick={() => setFlowAggregation("year")} className={cn("px-2.5 py-1.5 transition-colors", flowAggregation === "year" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")} data-testid="button-flow-agg-year">Yr</button>
              </div>
            </CardHeader>
            <CardContent>
              {flowData && flowData.months.length > 0 && flowData.platforms ? (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={aggregatedFlowMonths} margin={{ left: 4, top: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tickFormatter={fmtFlowLabel} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={v => formatCurrency(v, currency)} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={70} />
                      <Tooltip formatter={(v: number, name: string) => [formatCurrency(v, currency), name]} labelFormatter={fmtFlowLabel} contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                      <Legend />
                      {filteredFlowPlatforms.map((p, i) => (
                        <Bar key={p.name} dataKey={p.name} stackId="flow" fill={p.color}>
                          {i === filteredFlowPlatforms.length - 1 && (
                            <LabelList
                              dataKey="__total__"
                              position="top"
                              formatter={(v: number) => v > 0 ? formatCompactCurrency(v, currency) : ""}
                              style={{ fontSize: 9, fill: "hsl(var(--muted-foreground))", fontWeight: 500 }}
                            />
                          )}
                        </Bar>
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No investment data available.</p>
              )}
            </CardContent>
          </Card>

          {/* Portfolio Waterfall */}
          <WaterfallChart currency={currency} excludedPlatforms={excludedPlatforms} />

          {/* Platform Performance (combined table + allocation targets) */}
          {platforms != null && (() => {
            const totalPortfolioValue = platforms.reduce((s, p) => s + (Number(p.currentValue) || 0), 0);
            const totalTargetPct = platforms.reduce((s, p) => {
              const t = localTargets[p.id];
              return s + (t !== '' && t != null ? Number(t) : 0);
            }, 0);
            const totalRequired = platforms.reduce((s, p) => {
              const t = localTargets[p.id];
              if (t === '' || t == null) return s;
              const targetVal = (Number(t) / 100) * totalPortfolioValue;
              const needed = targetVal - (Number(p.currentValue) || 0);
              return needed > 0 ? s + needed : s;
            }, 0);

            return (
              <Card className="shadow-md">
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2">
                      <Target className="w-5 h-5 text-primary" />
                      <div>
                        <CardTitle>Platform Performance</CardTitle>
                        <CardDescription>Table: click headers to sort, click a row to open — Targets: set allocation targets per platform</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={cn("text-sm font-semibold px-3 py-1 rounded-full",
                        Math.abs(totalTargetPct - 100) < 0.1 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : totalTargetPct > 100 ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      )}>
                        {totalTargetPct.toFixed(1)}% / 100%
                      </div>
                      <Button size="sm" onClick={() => saveTargetsMutation.mutate()} disabled={saveTargetsMutation.isPending} data-testid="button-save-targets">
                        {saveTargetsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                        Save Targets
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <Tabs defaultValue="table">
                  <div className="px-6 pb-0 border-b">
                    <TabsList className="mb-0 rounded-none border-0 bg-transparent p-0 gap-1">
                      <TabsTrigger value="table" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-3">Table</TabsTrigger>
                      <TabsTrigger value="targets" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-3">Targets</TabsTrigger>
                    </TabsList>
                  </div>
                  <TabsContent value="table" className="mt-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" data-testid="platform-performance-table">
                        <thead>
                          <tr className="border-b">
                            {(
                              [
                                { key: "name", label: "Name" },
                                { key: "invested", label: "Invested" },
                                { key: "current", label: "Current Value" },
                                { key: "pnl", label: "P&L" },
                                { key: "roi", label: "ROI %" },
                                { key: "mom", label: "MoM %" },
                                { key: "target", label: "Target %" },
                                { key: "delta", label: "Delta" },
                              ] as { key: SortKey; label: string }[]
                            ).map(({ key, label }) => (
                              <th key={key} className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none whitespace-nowrap" onClick={() => toggleSort(key)} data-testid={`table-sort-${key}`}>
                                {label}
                                <SortIndicator col={key} />
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sortedTable.map(p => (
                            <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors" onClick={() => navigate(`/platforms/${encodeURIComponent(p.name.toLowerCase().replace(/\s+/g, '-'))}`)} data-testid={`table-row-platform-${p.id}`}>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <PlatformIcon icon={p.icon} customIconUrl={p.customIconUrl} color={p.color} name={p.name} size="sm" />
                                  <span className="font-medium">{p.name}</span>
                                  <Badge variant="outline" className="text-[10px] py-0 h-4 hidden sm:inline-flex">{p.category}</Badge>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">{formatCurrency(p.invested, currency)}</td>
                              <td className="px-4 py-3 font-medium">{formatCurrency(p.current, currency)}</td>
                              <td className={cn("px-4 py-3 font-medium", p.pnl >= 0 ? "text-emerald-500" : "text-red-500")}>
                                {p.pnl >= 0 ? "+" : ""}{formatCurrency(p.pnl, currency)}
                              </td>
                              <td className={cn("px-4 py-3 font-medium", p.roi >= 0 ? "text-emerald-500" : "text-red-500")}>{fmtPct(p.roi)}</td>
                              <td className={cn("px-4 py-3", p.mom != null ? (p.mom >= 0 ? "text-emerald-500" : "text-red-500") : "text-muted-foreground")}>
                                {p.mom != null ? fmtPct(p.mom) : "—"}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">{p.target != null ? `${p.target.toFixed(1)}%` : "—"}</td>
                              <td className={cn("px-4 py-3", p.delta != null ? (p.delta >= 0 ? "text-emerald-500" : "text-red-500") : "text-muted-foreground")}>
                                {p.delta != null ? `${p.delta >= 0 ? "+" : ""}${p.delta.toFixed(1)}%` : "—"}
                              </td>
                            </tr>
                          ))}
                          {sortedTable.length === 0 && (
                            <tr>
                              <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No platforms found.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </TabsContent>
                  <TabsContent value="targets" className="mt-0">
                    <div className="divide-y divide-border">
                      {platforms.map(p => {
                        const val = Number(p.currentValue) || 0;
                        const invested = Number(p.totalInvested) || 0;
                        const gain = val - invested;
                        const gainPct = invested > 0 ? (gain / invested) * 100 : 0;
                        const currentPct = totalPortfolioValue > 0 ? (val / totalPortfolioValue) * 100 : 0;
                        const targetStr = localTargets[p.id] ?? '';
                        const targetNum = targetStr !== '' ? Number(targetStr) : null;
                        const targetVal = targetNum != null ? (targetNum / 100) * totalPortfolioValue : null;
                        const required = targetVal != null ? targetVal - val : null;
                        const delta = targetNum != null ? targetNum - currentPct : null;

                        return (
                          <div key={p.id} className="flex items-center gap-4 px-6 py-3 hover:bg-muted/20 transition-colors flex-wrap">
                            <Link href={`/platforms/${encodeURIComponent(p.name.toLowerCase().replace(/\s+/g, '-'))}`} className="flex items-center gap-3 group flex-1 min-w-[140px]">
                              <div className="group-hover:scale-110 transition-transform">
                                <PlatformIcon icon={(p as any).icon} customIconUrl={(p as any).customIconUrl} color={p.color} name={p.name} size="md" />
                              </div>
                              <div>
                                <div className="font-semibold text-sm group-hover:text-primary transition-colors">{p.name}</div>
                                <div className="text-xs text-muted-foreground">{p.category}</div>
                              </div>
                            </Link>
                            <div className="text-right min-w-[100px]">
                              <div className="text-sm font-medium">{formatCurrency(val, currency)}</div>
                              <div className={cn("text-xs font-medium", gainPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                                {gainPct >= 0 ? '+' : ''}{gainPct.toFixed(2)}%
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground min-w-[55px] text-right">
                              {currentPct.toFixed(1)}% alloc
                            </div>
                            <div className="flex items-center gap-2 min-w-[130px]">
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                value={targetStr}
                                placeholder="—"
                                className="w-20 h-8 text-sm text-right"
                                data-testid={`input-target-${p.id}`}
                                onChange={e => {
                                  setLocalTargets(prev => ({ ...prev, [p.id]: e.target.value }));
                                  setTargetsDirty(true);
                                }}
                              />
                              <span className="text-sm text-muted-foreground">%</span>
                            </div>
                            {delta != null ? (
                              <div className={cn("flex items-center gap-1 text-xs font-medium min-w-[70px]",
                                delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                              )}>
                                {delta >= 0 ? <ArrowUpCircle className="w-3.5 h-3.5" /> : <ArrowDownCircle className="w-3.5 h-3.5" />}
                                {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
                              </div>
                            ) : (
                              <div className="min-w-[70px]" />
                            )}
                            <div className="text-right min-w-[110px]">
                              {required != null ? (
                                required > 0.005 ? (
                                  <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                                    +{formatCurrency(required, currency)}
                                  </div>
                                ) : required < -0.005 ? (
                                  <div className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                                    {formatCurrency(required, currency)} over
                                  </div>
                                ) : (
                                  <div className="text-sm text-muted-foreground">On target</div>
                                )
                              ) : (
                                <div className="text-xs text-muted-foreground">No target set</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {totalRequired > 0 && (
                      <div className="px-6 py-4 bg-muted/30 border-t border-border flex items-center justify-between flex-wrap gap-2">
                        <span className="text-sm text-muted-foreground">Total additional investment needed</span>
                        <span className="font-bold text-base text-emerald-600 dark:text-emerald-400">
                          +{formatCurrency(totalRequired, currency)}
                        </span>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </Card>
            );
          })()}

        </div>

        {/* ── Sticky right filter panel ─────────────────────────────────── */}
        {platforms && platforms.length > 0 && (
          <div className="sticky top-8 w-48 shrink-0 space-y-3 bg-card border border-border rounded-xl p-3 shadow-sm" data-testid="platform-filter-bar">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <Filter className="w-3.5 h-3.5" />
              Platforms
            </div>
            <div className="space-y-1">
              {platforms.map(p => {
                const excluded = excludedPlatforms.has(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    data-testid={`filter-platform-${p.id}`}
                    title={excluded ? `Include ${p.name}` : `Exclude ${p.name}`}
                    className={cn(
                      "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all text-left",
                      excluded
                        ? "opacity-40 text-muted-foreground"
                        : "bg-muted/60 hover:bg-muted text-foreground"
                    )}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: excluded ? "#888" : p.color }} />
                    <span className="truncate">{p.name}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1 pt-1 border-t">
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs flex-1" onClick={() => setExcludedPlatforms(new Set())} data-testid="filter-select-all">All</Button>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs flex-1" onClick={() => setExcludedPlatforms(new Set(platforms.map(p => p.id)))} data-testid="filter-deselect-all">None</Button>
            </div>
            <Popover open={filterPresetsOpen} onOpenChange={setFilterPresetsOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-full h-7 gap-1 text-xs" data-testid="button-filter-presets">
                  <Bookmark className="w-3 h-3" />
                  Presets
                  {savedFilters && savedFilters.length > 0 && (
                    <span className="bg-primary/10 text-primary rounded-full px-1 ml-auto">{savedFilters.length}</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent side="left" align="start" className="w-72 p-3" data-testid="popover-filter-presets">
                <div className="space-y-3">
                  <p className="text-sm font-medium">Saved Filter Presets</p>
                  {savedFilters && savedFilters.length > 0 ? (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {savedFilters.map(filter => (
                        <div key={filter.id} className="flex items-center gap-2 group" data-testid={`filter-preset-${filter.id}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="flex-1 justify-start text-sm h-8"
                            onClick={() => {
                              setExcludedPlatforms(new Set(filter.excludedPlatformIds));
                              setFilterPresetsOpen(false);
                            }}
                            data-testid={`button-apply-filter-${filter.id}`}
                          >
                            {filter.name}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                            onClick={e => {
                              e.stopPropagation();
                              deleteFilterMutation.mutate(filter.id);
                            }}
                            data-testid={`button-delete-filter-${filter.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No saved presets yet. Toggle platforms and save them here.</p>
                  )}
                  <div className="border-t pt-3">
                    <p className="text-xs text-muted-foreground mb-2">Save current filter as preset</p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Preset name..."
                        value={filterPresetName}
                        onChange={e => setFilterPresetName(e.target.value)}
                        className="h-8 text-sm"
                        onKeyDown={e => {
                          if (e.key === "Enter" && filterPresetName.trim())
                            saveFilterMutation.mutate(filterPresetName.trim());
                        }}
                        data-testid="input-filter-preset-name"
                      />
                      <Button
                        size="sm"
                        className="h-8 px-3"
                        disabled={!filterPresetName.trim() || saveFilterMutation.isPending}
                        onClick={() => saveFilterMutation.mutate(filterPresetName.trim())}
                        data-testid="button-save-filter-preset"
                      >
                        <Save className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}

      </div>
    </Layout>
  );
}
