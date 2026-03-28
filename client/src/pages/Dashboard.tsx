import { Layout } from "@/components/Layout";
import { StatCard } from "@/components/StatCard";
import { usePlatforms } from "@/hooks/use-platforms";
import { useAuth } from "@/App";
import { formatCurrency, getCurrencySymbol } from "@/lib/currency";
import { Wallet, TrendingUp, DollarSign, Check, RefreshCw, Loader2, CheckCircle, XCircle, ChevronDown, ChevronUp, X, Save, Bookmark, Trash2, Target, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { PlatformIcon } from "@/components/PlatformIcon";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { Link } from "wouter";
import { format, formatDistanceToNow } from "date-fns";
import { useState, useRef, useEffect, useMemo } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DashboardFilter } from "@shared/schema";

export default function Dashboard() {
  const { user } = useAuth();
  const currency = user?.currency || "EUR";
  const { data: platforms, isLoading: isPlatformsLoading } = usePlatforms();
  const [range, setRange] = useState("all");
  const [specificYear, setSpecificYear] = useState<string | null>(null);
  const [specificMonth, setSpecificMonth] = useState<string | null>(null);
  const [excludedPlatforms, setExcludedPlatforms] = useState<number[]>([]);
  const [chartView, setChartView] = useState<"overview" | "profit" | "monthly" | "all">("overview");
  const { toast } = useToast();

  const [filterPresetName, setFilterPresetName] = useState("");
  const [filterPresetsOpen, setFilterPresetsOpen] = useState(false);

  const { data: savedFilters } = useQuery<DashboardFilter[]>({
    queryKey: ['/api/dashboard-filters'],
  });

  const saveFilterMutation = useMutation({
    mutationFn: async (name: string) => {
      await apiRequest('POST', '/api/dashboard-filters', { name, excludedPlatformIds: excludedPlatforms });
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

  const { data: scraperConfigs } = useQuery<{ platformId: number; platformName: string; lastScrapeAt: string | null }[]>({
    queryKey: ['/api/scraper-configs'],
  });

  const lastScrapeAt = scraperConfigs
    ?.map(c => c.lastScrapeAt ? new Date(c.lastScrapeAt) : null)
    .filter((d): d is Date => d !== null)
    .reduce<Date | null>((max, d) => (max === null || d > max ? d : max), null) ?? null;

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
      queryClient.invalidateQueries({ queryKey: ['/api/scraper-configs'] });
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

    const monthMap = new Map<string, { value: number; invested: number; date: string; dist: number }>();
    for (const h of history) {
      const d = new Date(h.date);
      const key = format(d, 'yyyy-MM');
      const target = new Date(d.getFullYear(), d.getMonth(), 10);
      const dist = Math.abs(d.getTime() - target.getTime());
      const existing = monthMap.get(key);
      if (!existing || dist < existing.dist) {
        monthMap.set(key, { value: h.value, invested: h.invested, date: h.date, dist });
      }
    }

    return Array.from(monthMap.values()).map(data => ({
      date: data.date,
      value: data.value,
      invested: data.invested,
    }));
  }, [history]);


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

  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const d = payload[0]?.payload;
    return (
      <div className="rounded-xl border border-border bg-card shadow-lg px-4 py-3 text-sm min-w-[200px]">
        <p className="font-semibold text-foreground mb-2">{label ? format(new Date(label), 'MMM dd, yyyy') : ''}</p>
        {payload.map((entry: any) => {
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
                  {entry.dataKey === 'monthlyChange' || entry.dataKey === 'gain'
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
      </div>
    );
  };

  const totalValue = statsData.value;
  const totalInvested = statsData.invested;
  const netProfit = totalValue - totalInvested;
  const roi = totalInvested > 0 ? (netProfit / totalInvested) * 100 : 0;

  // Filter platforms based on exclusion list
  const filteredPlatforms = platforms?.filter(p => !excludedPlatforms.includes(p.id)) || [];


  return (
    <Layout>
      <div className="space-y-8">
        
        {/* Header Section */}
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
            platformBreakdown={filteredPlatforms.map(p => {
              const val = Number(p.currentValue) || 0;
              const pct = totalValue > 0 ? (val / totalValue) * 100 : 0;
              return {
                name: p.name,
                value: formatCurrency(val, currency),
                percent: `${pct.toFixed(1)}%`,
                iconUrl: (p as any).customIconUrl,
                sortValue: val
              };
            })}
            data-testid="stat-total-value"
          />
          <StatCard 
            title="Total Invested" 
            value={formatCurrency(totalInvested, currency)} 
            icon={DollarSign}
            className="border-l-blue-500"
            platformBreakdown={filteredPlatforms.map(p => {
              const inv = Number(p.totalInvested) || 0;
              const pct = totalInvested > 0 ? (inv / totalInvested) * 100 : 0;
              return {
                name: p.name,
                value: formatCurrency(inv, currency),
                percent: `${pct.toFixed(1)}%`,
                iconUrl: (p as any).customIconUrl,
                sortValue: inv
              };
            })}
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
              const roi = invested > 0 ? (profit / invested) * 100 : 0;
              return {
                name: p.name,
                value: `${profit >= 0 ? '+' : ''}${formatCurrency(profit, currency)}`,
                percent: `${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`,
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
          <div className="ml-auto flex items-center gap-2">
            <Popover open={filterPresetsOpen} onOpenChange={setFilterPresetsOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-filter-presets">
                  <Bookmark className="w-3.5 h-3.5" />
                  Presets
                  {savedFilters && savedFilters.length > 0 && (
                    <span className="ml-1 text-xs bg-primary/10 text-primary rounded-full px-1.5">{savedFilters.length}</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-3" data-testid="popover-filter-presets">
                <div className="space-y-3">
                  <p className="text-sm font-medium">Saved Filter Presets</p>
                  {savedFilters && savedFilters.length > 0 ? (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {savedFilters.map((filter) => (
                        <div key={filter.id} className="flex items-center gap-2 group" data-testid={`filter-preset-${filter.id}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="flex-1 justify-start text-sm h-8"
                            onClick={() => {
                              setExcludedPlatforms(filter.excludedPlatformIds);
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
                            onClick={(e) => {
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
                    <p className="text-xs text-muted-foreground">No saved presets yet. Set up your platform filters above and save them here.</p>
                  )}
                  <div className="border-t pt-3">
                    <p className="text-xs text-muted-foreground mb-2">Save current filter as preset</p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Preset name..."
                        value={filterPresetName}
                        onChange={(e) => setFilterPresetName(e.target.value)}
                        className="h-8 text-sm"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && filterPresetName.trim()) {
                            saveFilterMutation.mutate(filterPresetName.trim());
                          }
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
                <TabsTrigger value="monthly" data-testid="tab-chart-monthly">Monthly Growth</TabsTrigger>
                <TabsTrigger value="all" data-testid="tab-chart-all">All</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="h-[400px] w-full">
              {chartData && chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData.map((h: any, i: number, arr: any[]) => {
                    const prev = arr[i - 1];
                    const totalChange = i === 0 ? 0 : (h.value - prev.value) - (h.invested - prev.invested);
                    return {
                      ...h,
                      timestamp: new Date(h.date).getTime(),
                      gain: h.value - h.invested,
                      monthlyChange: totalChange,
                      valueChange: i === 0 ? null : h.value - prev.value,
                      investedChange: i === 0 ? null : h.invested - prev.invested,
                      gainChange: i === 0 ? null : (h.value - h.invested) - (prev.value - prev.invested),
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
                    <Tooltip content={<ChartTooltip />} />
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
                        name="Monthly Growth"
                        yAxisId="monthly"
                        stroke="#f59e0b" 
                        strokeWidth={chartView === "all" ? 3 : 4}
                        dot={{ r: 5, fill: '#f59e0b', strokeWidth: 0 }}
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

        {/* Platform Performance + Allocation Targets */}
        {platforms && platforms.length > 0 && (() => {
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
                      <CardDescription>Value, ROI and allocation targets per platform</CardDescription>
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
                    <Button
                      size="sm"
                      onClick={() => saveTargetsMutation.mutate()}
                      disabled={saveTargetsMutation.isPending}
                      data-testid="button-save-targets"
                    >
                      {saveTargetsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                      Save Targets
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
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
                            <PlatformIcon
                              icon={(p as any).icon}
                              customIconUrl={(p as any).customIconUrl}
                              color={p.color}
                              name={p.name}
                              size="md"
                            />
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
              </CardContent>
            </Card>
          );
        })()}
      </div>
    </Layout>
  );
}
