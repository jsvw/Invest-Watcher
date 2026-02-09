import { Layout } from "@/components/Layout";
import { StatCard } from "@/components/StatCard";
import { usePlatforms } from "@/hooks/use-platforms";
import { useAuth } from "@/App";
import { formatCurrency, getCurrencySymbol } from "@/lib/currency";
import { Wallet, TrendingUp, DollarSign, Check, RefreshCw, Loader2, CheckCircle, XCircle, ChevronDown, ChevronUp, X } from "lucide-react";
import { PlatformIcon } from "@/components/PlatformIcon";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { Link } from "wouter";
import { format } from "date-fns";
import { useState, useRef, useEffect, useMemo } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

export default function Dashboard() {
  const { user } = useAuth();
  const currency = user?.currency || "EUR";
  const { data: platforms, isLoading: isPlatformsLoading } = usePlatforms();
  const [range, setRange] = useState("all");
  const [specificYear, setSpecificYear] = useState<string | null>(null);
  const [specificMonth, setSpecificMonth] = useState<string | null>(null);
  const [excludedPlatforms, setExcludedPlatforms] = useState<number[]>([]);
  const [chartView, setChartView] = useState<"overview" | "profit" | "monthly" | "realDaily" | "all">("overview");
  const [chartDataMode, setChartDataMode] = useState<"daily" | "monthly">("monthly");
  const { toast } = useToast();

  const [scrapeLog, setScrapeLog] = useState<{ platformName: string; success: boolean; message: string }[] | null>(null);
  const [scrapeLogOpen, setScrapeLogOpen] = useState(false);
  const scrapeLogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrapeLogRef.current) {
      scrapeLogRef.current.scrollTop = scrapeLogRef.current.scrollHeight;
    }
  }, [scrapeLog]);

  const scrapeAllMutation = useMutation({
    mutationFn: async () => {
      setScrapeLog([]);
      setScrapeLogOpen(true);

      const configsRes = await fetch('/api/scraper-configs', { credentials: 'include' });
      if (!configsRes.ok) throw new Error("Failed to fetch scraper configs");
      const configs: { platformId: number; platformName: string }[] = await configsRes.json();

      if (configs.length === 0) {
        return { results: [] };
      }

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
    },
    onError: (err: any) => {
      setScrapeLog(prev => [...(prev || []), { platformName: "Error", success: false, message: err.message }]);
      toast({ title: "Scraping Failed", description: err.message, variant: "destructive" });
    },
  });

  const formatAxisValue = (value: number, showSign: boolean = false) => {
    const symbol = getCurrencySymbol(currency);
    const sign = showSign && value >= 0 ? '+' : '';
    const absValue = Math.abs(value);
    
    if (absValue >= 1000000) {
      return `${sign}${symbol}${(value / 1000000).toFixed(1)}M`;
    } else if (absValue >= 1000) {
      return `${sign}${symbol}${(value / 1000).toFixed(1)}k`;
    } else if (absValue >= 1) {
      return `${sign}${symbol}${value.toFixed(0)}`;
    } else {
      return `${sign}${symbol}${value.toFixed(2)}`;
    }
  };

  const togglePlatform = (platformId: number) => {
    setExcludedPlatforms(prev => 
      prev.includes(platformId) 
        ? prev.filter(id => id !== platformId)
        : [...prev, platformId]
    );
  };

  const { data: history, isLoading: isHistoryLoading } = useQuery({
    queryKey: [api.portfolio.history.path, range, specificYear, specificMonth, excludedPlatforms],
    queryFn: async () => {
      let url = `${api.portfolio.history.path}?range=${range}`;
      if (specificYear) url += `&year=${specificYear}`;
      if (specificMonth) url += `&month_select=${specificMonth}`;
      if (excludedPlatforms.length > 0) url += `&excludePlatforms=${excludedPlatforms.join(',')}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch history");
      return await res.json();
    },
    placeholderData: (previousData) => previousData,
  });

  const { data: availableFilters } = useQuery({
    queryKey: ['/api/portfolio/available-filters'],
    queryFn: async () => {
      const res = await fetch('/api/portfolio/available-filters', { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch filters");
      return await res.json();
    }
  });

  const { data: platformMomData } = useQuery({
    queryKey: ['/api/portfolio/platform-mom', excludedPlatforms],
    queryFn: async () => {
      let url = '/api/portfolio/platform-mom';
      if (excludedPlatforms.length > 0) url += `?excludePlatforms=${excludedPlatforms.join(',')}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch platform MoM");
      return await res.json();
    }
  });

  const years = availableFilters?.years || [];
  const monthsData = availableFilters?.months?.map((m: string) => {
    const [y, mm] = m.split('-');
    const monthName = new Date(parseInt(y), parseInt(mm) - 1).toLocaleString('default', { month: 'long' });
    return { value: mm, label: monthName, year: y };
  }) || [];

  const currentYear = years[0] || new Date().getFullYear().toString();

  const chartData = useMemo(() => {
    if (!history || history.length === 0) return [];
    if (chartDataMode === "daily") return history;

    const monthMap = new Map<string, { values: number[]; investeds: number[]; date: string }>();
    for (const h of history) {
      const key = format(new Date(h.date), 'yyyy-MM');
      if (!monthMap.has(key)) {
        monthMap.set(key, { values: [], investeds: [], date: h.date });
      }
      const entry = monthMap.get(key)!;
      entry.values.push(h.value);
      entry.investeds.push(h.invested);
      entry.date = h.date;
    }

    return Array.from(monthMap.entries()).map(([key, data]) => {
      const avgValue = data.values.reduce((a, b) => a + b, 0) / data.values.length;
      const avgInvested = data.investeds.reduce((a, b) => a + b, 0) / data.investeds.length;
      return {
        date: `${key}-15`,
        value: avgValue,
        invested: avgInvested,
      };
    });
  }, [history, chartDataMode]);

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

  // Calculate Aggregates
  const statsData = history && history.length > 0 
    ? history[history.length - 1] 
    : { value: 0, invested: 0 };

  const totalValue = statsData.value;
  const totalInvested = statsData.invested;
  const netProfit = totalValue - totalInvested;
  const roi = totalInvested > 0 ? (netProfit / totalInvested) * 100 : 0;

  // Filter platforms based on exclusion list
  const filteredPlatforms = platforms?.filter(p => !excludedPlatforms.includes(p.id)) || [];

  // Prepare Chart Data
  const pieData = filteredPlatforms.reduce((acc: any[], platform) => {
    const existing = acc.find(item => item.name === platform.category);
    if (existing) {
      existing.value += Number(platform.currentValue) || 0;
    } else {
      acc.push({ name: platform.category, value: Number(platform.currentValue) || 0 });
    }
    return acc;
  }, []);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <Layout>
      <div className="space-y-8">
        
        {/* Header Section */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">Dashboard</h1>
            <p className="text-muted-foreground">Your financial overview at a glance.</p>
          </div>
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
        </div>

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
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => setScrapeLogOpen(false)} data-testid="button-close-scrape-log">
                  <X className="h-4 w-4" />
                </Button>
              </div>
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

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <StatCard 
            title="Total Portfolio Value" 
            value={formatCurrency(totalValue, currency)} 
            icon={Wallet} 
            className="border-l-primary"
            platformBreakdown={filteredPlatforms.map(p => ({
              name: p.name,
              value: formatCurrency(Number(p.currentValue) || 0, currency),
              iconUrl: (p as any).customIconUrl,
              sortValue: Number(p.currentValue) || 0
            }))}
            data-testid="stat-total-value"
          />
          <StatCard 
            title="Total Invested" 
            value={formatCurrency(totalInvested, currency)} 
            icon={DollarSign}
            className="border-l-blue-500"
            platformBreakdown={filteredPlatforms.map(p => ({
              name: p.name,
              value: formatCurrency(Number(p.totalInvested) || 0, currency),
              iconUrl: (p as any).customIconUrl,
              sortValue: Number(p.totalInvested) || 0
            }))}
            data-testid="stat-total-invested"
          />
          <StatCard 
            title="Net Profit / Loss" 
            value={formatCurrency(Math.abs(netProfit), currency)} 
            trend={netProfit >= 0 ? "up" : "down"}
            trendValue={`${roi.toFixed(2)}%`}
            icon={TrendingUp}
            className={netProfit >= 0 ? "border-l-emerald-500" : "border-l-rose-500"}
            platformBreakdown={filteredPlatforms.map(p => {
              const invested = Number(p.totalInvested) || 0;
              const value = Number(p.currentValue) || 0;
              const profit = value - invested;
              return {
                name: p.name,
                value: `${profit >= 0 ? '+' : ''}${formatCurrency(profit, currency)}`,
                iconUrl: (p as any).customIconUrl,
                sortValue: profit
              };
            })}
            data-testid="stat-net-profit"
          />
          <StatCard 
            title="MoM Performance" 
            value={(() => {
              if (!platformMomData || platformMomData.length === 0) return "N/A";
              const totalMomChange = platformMomData.reduce((sum: number, p: any) => sum + p.momChange, 0);
              return formatCurrency(totalMomChange, currency);
            })()} 
            trend={(() => {
              if (!platformMomData || platformMomData.length === 0) return undefined;
              const totalMomChange = platformMomData.reduce((sum: number, p: any) => sum + p.momChange, 0);
              return totalMomChange >= 0 ? "up" : "down";
            })()}
            trendValue={(() => {
              if (!platformMomData || platformMomData.length === 0) return "";
              const totalPrevValue = platformMomData.reduce((sum: number, p: any) => sum + p.prevValue, 0);
              const totalMomChange = platformMomData.reduce((sum: number, p: any) => sum + p.momChange, 0);
              const growthPercent = totalPrevValue > 0 ? (totalMomChange / totalPrevValue) * 100 : 0;
              return `${growthPercent.toFixed(1)}%`;
            })()}
            icon={TrendingUp}
            className={(() => {
              if (!platformMomData || platformMomData.length === 0) return "border-l-muted";
              const totalMomChange = platformMomData.reduce((sum: number, p: any) => sum + p.momChange, 0);
              return totalMomChange >= 0 ? "border-l-emerald-500" : "border-l-rose-500";
            })()}
            platformBreakdown={platformMomData?.map((p: any) => ({
              name: p.name,
              value: `${p.momGrowthPercent >= 0 ? '+' : ''}${p.momGrowthPercent.toFixed(1)}% (${p.momChange >= 0 ? '+' : ''}${formatCurrency(p.momChange, currency)})`,
              iconUrl: p.customIconUrl,
              sortValue: p.momGrowthPercent
            })) || []}
            data-testid="stat-mom-profit"
          />
        </div>

        {/* Platform Filter Icons */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground mr-2">Filter:</span>
          {platforms?.map((platform) => {
            const isExcluded = excludedPlatforms.includes(platform.id);
            return (
              <UITooltip key={platform.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => togglePlatform(platform.id)}
                    className={cn(
                      "relative border-2 rounded-full transition-all",
                      isExcluded 
                        ? "opacity-50 border-muted-foreground/30" 
                        : "opacity-100 hover:scale-110 border-transparent"
                    )}
                    data-testid={`platform-icon-${platform.id}`}
                  >
                    <PlatformIcon
                      icon={(platform as any).icon}
                      customIconUrl={(platform as any).customIconUrl}
                      color={platform.color}
                      name={platform.name}
                      size="lg"
                    />
                    {!isExcluded && (
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{platform.name} {isExcluded ? "(excluded)" : "(included)"}</p>
                </TooltipContent>
              </UITooltip>
            );
          })}
          {excludedPlatforms.length > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setExcludedPlatforms([])}
              className="text-xs"
              data-testid="button-show-all-platforms"
            >
              Show All
            </Button>
          )}
          {platforms && platforms.length > 0 && excludedPlatforms.length < platforms.length && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setExcludedPlatforms(platforms.map(p => p.id))}
              className="text-xs"
              data-testid="button-deselect-all-platforms"
            >
              Deselect All
            </Button>
          )}
        </div>

        {/* AI Insight Section */}
        {/* ... existing code ... */}

        {/* Portfolio Performance History */}
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
                    {years.map((y: string) => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {(range === "month" || range.startsWith("month-")) && (
                <div className="flex gap-2">
                  <Select value={specificYear || (range.startsWith("month-") ? range.split("-")[1] : currentYear)} onValueChange={(val) => setSpecificYear(val)}>
                    <SelectTrigger className="w-[100px] h-9">
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((y: string) => (
                        <SelectItem key={y} value={y}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={specificMonth || (range.startsWith("month-") ? range.split("-")[2] : "")} onValueChange={(val) => {
                    const year = specificYear || (range.startsWith("month-") ? range.split("-")[1] : currentYear);
                    setRange(`month-${year}-${val}`);
                    setSpecificMonth(val);
                  }}>
                    <SelectTrigger className="w-[120px] h-9">
                      <SelectValue placeholder="Month" />
                    </SelectTrigger>
                    <SelectContent>
                      {monthsData.filter((m: any) => m.year === (specificYear || (range.startsWith("month-") ? range.split("-")[1] : currentYear))).map((m: any) => (
                        <SelectItem key={`${m.year}-${m.value}`} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Tabs value={chartDataMode} onValueChange={(v) => setChartDataMode(v as "daily" | "monthly")} className="w-auto">
                <TabsList>
                  <TabsTrigger value="daily" data-testid="tab-data-daily">Daily</TabsTrigger>
                  <TabsTrigger value="monthly" data-testid="tab-data-monthly">Monthly Avg</TabsTrigger>
                </TabsList>
              </Tabs>
              <Tabs value={range.startsWith("year-") ? "year" : range.startsWith("month-") ? "month" : range} onValueChange={(val) => {
                setRange(val);
                setSpecificYear(null);
                setSpecificMonth(null);
              }} className="w-auto">
                <TabsList>
                  <TabsTrigger value="7d">7D</TabsTrigger>
                  <TabsTrigger value="month">1M</TabsTrigger>
                  <TabsTrigger value="quarter">3M</TabsTrigger>
                  <TabsTrigger value="year">1Y</TabsTrigger>
                  <TabsTrigger value="all">ALL</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            {history && history.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="text-sm text-muted-foreground">Total Invested</div>
                  <div className="text-2xl font-bold" data-testid="text-chart-invested">
                    {formatCurrency(history[history.length - 1].invested, currency)}
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="text-sm text-muted-foreground">Current Value</div>
                  <div className="text-2xl font-bold" data-testid="text-chart-value">
                    {formatCurrency(history[history.length - 1].value, currency)}
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="text-sm text-muted-foreground">Profit / Loss</div>
                  {(() => {
                    const profitLoss = history[history.length - 1].value - history[history.length - 1].invested;
                    const profitPercent = history[history.length - 1].invested > 0 
                      ? (profitLoss / history[history.length - 1].invested) * 100 
                      : 0;
                    return (
                      <div className={`text-2xl font-bold flex items-center gap-2 ${
                        Math.abs(profitPercent) < 0.1 ? 'text-muted-foreground' : 
                        profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                      }`} data-testid="text-chart-profit">
                        {profitLoss >= 0 ? '+' : ''}{formatCurrency(profitLoss, currency)}
                        <span className="text-sm font-normal">
                          ({profitLoss >= 0 ? '+' : ''}{profitPercent.toFixed(1)}%)
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
            <Tabs value={chartView} onValueChange={(v) => setChartView(v as any)} className="mb-4">
              <TabsList>
                <TabsTrigger value="overview" data-testid="tab-chart-overview">Value Overview</TabsTrigger>
                <TabsTrigger value="profit" data-testid="tab-chart-profit">Profit/Loss</TabsTrigger>
                <TabsTrigger value="monthly" data-testid="tab-chart-monthly">{chartDataMode === "daily" ? "Daily" : "Monthly"} Growth</TabsTrigger>
                <TabsTrigger value="realDaily" data-testid="tab-chart-real-daily">Avg Daily Growth</TabsTrigger>
                <TabsTrigger value="all" data-testid="tab-chart-all">All</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="h-[400px] w-full">
              {chartData && chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData.map((h: any, i: number, arr: any[]) => {
                    const totalChange = i === 0 ? 0 : (h.value - arr[i - 1].value) - (h.invested - arr[i - 1].invested);
                    const daysBetween = i === 0 ? 1 : Math.max(1, Math.round((new Date(h.date).getTime() - new Date(arr[i - 1].date).getTime()) / (1000 * 60 * 60 * 24)));
                    return {
                      ...h, 
                      timestamp: new Date(h.date).getTime(),
                      gain: h.value - h.invested,
                      monthlyChange: totalChange,
                      realDailyGrowth: totalChange / daysBetween,
                    };
                  })}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
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
                    {(chartView === "overview" || chartView === "all") && (
                      <YAxis 
                        yAxisId="left"
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false} 
                        tickFormatter={(value) => formatAxisValue(value)}
                        domain={['auto', 'auto']}
                      />
                    )}
                    {(chartView === "profit" || chartView === "all") && (
                      <YAxis 
                        yAxisId="right"
                        orientation="right"
                        stroke="#10b981" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false} 
                        tickFormatter={(value) => formatAxisValue(value, true)}
                        domain={['auto', 'auto']}
                      />
                    )}
                    {(chartView === "monthly" || chartView === "all") && (
                      <YAxis 
                        yAxisId="monthly"
                        orientation="right"
                        stroke="#f59e0b" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false} 
                        tickFormatter={(value) => formatAxisValue(value, true)}
                        domain={['auto', 'auto']}
                      />
                    )}
                    {chartView === "realDaily" && (
                      <YAxis 
                        yAxisId="realDaily"
                        orientation="right"
                        stroke="#8b5cf6" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false} 
                        tickFormatter={(value) => formatAxisValue(value, true)}
                        domain={['auto', 'auto']}
                      />
                    )}
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      formatter={(value: number, name: string) => [
                        name === "Profit/Loss" || name.includes("Growth")
                          ? `${value >= 0 ? '+' : ''}${formatCurrency(value, currency)}`
                          : formatCurrency(value, currency), 
                        ""
                      ]}
                      labelFormatter={(ts) => format(new Date(ts), 'MMM dd, yyyy')}
                    />
                    <Legend verticalAlign="top" height={36}/>
                    {(chartView === "overview" || chartView === "all") && (
                      <>
                        <Line 
                          type="monotone" 
                          dataKey="value" 
                          name="Current Value"
                          yAxisId="left"
                          stroke="hsl(var(--primary))" 
                          strokeWidth={4}
                          dot={{ r: 5, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                          activeDot={{ r: 7 }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="invested" 
                          name="Total Invested"
                          yAxisId="left"
                          stroke="#8884d8" 
                          strokeWidth={3}
                          strokeDasharray="5 5"
                          dot={{ r: 5, fill: '#8884d8', strokeWidth: 0 }}
                        />
                      </>
                    )}
                    {(chartView === "profit" || chartView === "all") && (
                      <Line 
                        type="monotone" 
                        dataKey="gain" 
                        name="Profit/Loss"
                        yAxisId="right"
                        stroke="#10b981" 
                        strokeWidth={chartView === "all" ? 3 : 4}
                        dot={{ r: 5, fill: '#10b981', strokeWidth: 0 }}
                        activeDot={{ r: 7 }}
                      />
                    )}
                    {(chartView === "monthly" || chartView === "all") && (
                      <Line 
                        type="monotone" 
                        dataKey="monthlyChange" 
                        name={chartDataMode === "daily" ? "Daily Growth" : "Monthly Growth"}
                        yAxisId="monthly"
                        stroke="#f59e0b" 
                        strokeWidth={chartView === "all" ? 3 : 4}
                        dot={{ r: 5, fill: '#f59e0b', strokeWidth: 0 }}
                        activeDot={{ r: 7 }}
                      />
                    )}
                    {(chartView === "realDaily" || chartView === "all") && (
                      <Line 
                        type="monotone" 
                        dataKey="realDailyGrowth" 
                        name="Avg Daily Growth"
                        yAxisId={chartView === "all" ? "monthly" : "realDaily"}
                        stroke="#8b5cf6" 
                        strokeWidth={chartView === "all" ? 3 : 4}
                        dot={{ r: 5, fill: '#8b5cf6', strokeWidth: 0 }}
                        activeDot={{ r: 7 }}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No portfolio history available.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Allocation Chart */}
          <Card className="lg:col-span-1 shadow-md">
            <CardHeader>
              <CardTitle>Asset Allocation</CardTitle>
              <CardDescription>Distribution by category</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => formatCurrency(value, currency)}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-4 justify-center mt-4">
                {pieData.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="text-muted-foreground">{entry.name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Platforms List Preview */}
          <Card className="lg:col-span-2 shadow-md">
            <CardHeader>
              <CardTitle>Platform Performance</CardTitle>
              <CardDescription>Current value by platform</CardDescription>
            </CardHeader>
            <CardContent>
               {platforms && platforms.length > 0 ? (
                 <div className="space-y-4">
                   {platforms.map(platform => {
                     const val = Number(platform.currentValue) || 0;
                     const invested = Number(platform.totalInvested) || 0;
                     const gain = val - invested;
                     const percent = invested > 0 ? (gain / invested) * 100 : 0;
                     
                     return (
                       <Link key={platform.id} href={`/platforms/${platform.id}`} className="flex items-center justify-between p-4 bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer group">
                         <div className="flex items-center gap-4">
                           <div className="group-hover:scale-110 transition-transform">
                             <PlatformIcon
                               icon={(platform as any).icon}
                               customIconUrl={(platform as any).customIconUrl}
                               color={platform.color}
                               name={platform.name}
                               size="lg"
                             />
                           </div>
                           <div>
                             <h4 className="font-semibold group-hover:text-primary transition-colors">{platform.name}</h4>
                             <p className="text-xs text-muted-foreground">{platform.category}</p>
                           </div>
                         </div>
                         <div className="text-right">
                           <div className="font-bold">{formatCurrency(val, currency)}</div>
                           <div className={cn("text-xs font-medium", gain >= 0 ? "text-emerald-600" : "text-rose-600")}>
                             {gain >= 0 ? "+" : ""}{percent.toFixed(2)}%
                           </div>
                         </div>
                       </Link>
                     )
                   })}
                 </div>
               ) : (
                 <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                   No platforms added yet.
                 </div>
               )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
