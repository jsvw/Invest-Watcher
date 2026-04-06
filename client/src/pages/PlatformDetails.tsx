import { Layout } from "@/components/Layout";
import { AddTransactionDialog } from "@/components/AddTransactionDialog";
import { PlatformSettingsDialog } from "@/components/PlatformSettingsDialog";
import { usePlatform, usePlatforms } from "@/hooks/use-platforms";
import { useInvestments, useDeleteInvestment } from "@/hooks/use-investments";
import { useValuations, useDeleteValuation } from "@/hooks/use-valuations";
import { useWithdrawals, useDeleteWithdrawal } from "@/hooks/use-withdrawals";
import { useAssets, useUpdateAsset } from "@/hooks/use-assets";
import { useAuth } from "@/App";
import { formatCurrency, formatCompactCurrency, getCurrencySymbol } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { useRoute } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, History, DollarSign, Package, CheckCircle, MoreHorizontal, Pencil, LogOut, Search, ArrowUp, ArrowDown, ChevronsUpDown, Trash2, RotateCcw, BarChart3, RefreshCw, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { format, formatDistanceToNow } from "date-fns";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, Legend } from "recharts";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { api } from "@shared/routes";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddAssetDialog } from "@/components/AddAssetDialog";
import { AssetExitDialog } from "@/components/AssetExitDialog";
import { AssetValuationDialog } from "@/components/AssetValuationDialog";
import { AssetValuationImportDialog } from "@/components/AssetValuationImportDialog";
import { AssetValuationHoverCard } from "@/components/AssetValuationHoverCard";
import { AssetValuationManageDialog } from "@/components/AssetValuationManageDialog";
import { AssetInsightTabs } from "@/components/AssetInsightTabs";
import { AssetRepaymentDialog } from "@/components/AssetRepaymentDialog";
import type { Asset, PlatformResponse } from "@shared/schema";
import { PlatformIcon } from "@/components/PlatformIcon";
import { ScraperConfigDialog } from "@/components/ScraperConfigDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { BarChart as RechartsBarChart, Bar, XAxis as BarXAxis, YAxis as BarYAxis, Tooltip as BarTooltip, ResponsiveContainer as BarContainer, Cell as BarCell } from "recharts";

function TickerPriceHover({ ticker, currency, children }: { ticker: string; currency: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['/api/ticker-chart', ticker],
    queryFn: async () => {
      const res = await fetch(`/api/ticker-chart/${encodeURIComponent(ticker)}`, { credentials: 'include' });
      if (!res.ok) return { prices: [], symbol: ticker };
      return res.json();
    },
    enabled: open,
    staleTime: 4 * 60 * 60 * 1000,
  });

  const prices = data?.prices || [];
  const symbol = data?.symbol || ticker.replace(/_EQ$/, '');
  const tickerCurrency = data?.currency || currency;
  const hasData = prices.length > 0;
  const latestPrice = hasData ? prices[prices.length - 1].close : null;
  const firstPrice = hasData ? prices[0].close : null;
  const priceChange = latestPrice && firstPrice ? latestPrice - firstPrice : null;
  const priceChangePct = priceChange && firstPrice ? (priceChange / firstPrice) * 100 : null;

  return (
    <HoverCard openDelay={300} closeDelay={100} open={open} onOpenChange={setOpen}>
      <HoverCardTrigger asChild>
        {children}
      </HoverCardTrigger>
      <HoverCardContent className="w-80" side="right" align="start">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-sm">{symbol}</p>
            {hasData && (
              <div className="text-right">
                <p className="text-sm font-medium">{formatCurrency(latestPrice!, tickerCurrency)}</p>
                {priceChange !== null && (
                  <p className={`text-xs ${priceChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {priceChange >= 0 ? '+' : ''}{formatCurrency(priceChange, tickerCurrency)} ({priceChangePct! >= 0 ? '+' : ''}{priceChangePct!.toFixed(2)}%)
                  </p>
                )}
              </div>
            )}
          </div>
          {isLoading ? (
            <div className="h-24 flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : hasData ? (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={prices.map((p: any) => ({ ...p, timestamp: new Date(p.date).getTime() }))} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id={`grad-${ticker}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={priceChange! >= 0 ? '#10b981' : '#ef4444'} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={priceChange! >= 0 ? '#10b981' : '#ef4444'} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    scale="time"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(ts) => format(new Date(ts), 'MMM d')}
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={30}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tickFormatter={(val) => val.toFixed(0)}
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 6, padding: '4px 8px' }}
                    formatter={(val: number) => [formatCurrency(val, tickerCurrency), 'Close']}
                    labelFormatter={(ts) => format(new Date(ts), 'MMM d, yyyy')}
                  />
                  <Area
                    type="monotone"
                    dataKey="close"
                    stroke={priceChange! >= 0 ? '#10b981' : '#ef4444'}
                    fill={`url(#grad-${ticker})`}
                    strokeWidth={1.5}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">No price data available</p>
          )}
          <p className="text-[10px] text-muted-foreground text-right">90-day price history</p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function AssetActionsMenu({ asset, platformId, platformMode, currency }: { asset: Asset; platformId: number; platformMode: "asset_returns" | "item_valuations"; currency: string }) {
  const [editOpen, setEditOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [repaymentOpen, setRepaymentOpen] = useState(false);
  const [valuationOpen, setValuationOpen] = useState(false);
  const updateAsset = useUpdateAsset(platformId);
  
  const isActive = asset.status === "active";
  const isMaturedOrExited = asset.status === "matured" || asset.status === "exited";
  
  const handleRemoveExit = () => {
    if (confirm("Are you sure you want to remove the exit? The asset will be marked as active again.")) {
      updateAsset.mutate({
        id: asset.id,
        data: {
          status: "active",
          exitDate: null,
          exitPrice: null
        }
      });
    }
  };

  return (
    <div className="flex justify-end gap-1">
      {isActive ? (
        <>
          {platformMode === "asset_returns" && (
            <Button size="icon" variant="outline" onClick={() => setRepaymentOpen(true)} title="Record Repayment" data-testid={`button-repayment-${asset.id}`}>
              <RotateCcw className="h-4 w-4 text-blue-600" />
            </Button>
          )}
          {platformMode === "item_valuations" && (
            <Button size="icon" variant="outline" onClick={() => setValuationOpen(true)} title="Add Valuation" data-testid={`button-valuation-${asset.id}`}>
              <TrendingUp className="h-4 w-4" />
            </Button>
          )}
          <Button size="icon" variant="outline" onClick={() => setExitOpen(true)} title="Exit Asset" data-testid={`button-exit-${asset.id}`}>
            <LogOut className="h-4 w-4 text-orange-600" />
          </Button>
          <Button size="icon" variant="outline" onClick={() => setEditOpen(true)} title="Edit Asset" data-testid={`button-edit-${asset.id}`}>
            <Pencil className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" data-testid={`button-asset-menu-${asset.id}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditOpen(true)} data-testid={`menu-edit-asset-${asset.id}`}>
              <Pencil className="h-4 w-4 mr-2" /> Edit Asset
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setExitOpen(true)} data-testid={`menu-edit-exit-${asset.id}`}>
              <LogOut className="h-4 w-4 mr-2" /> Edit Exit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleRemoveExit} className="text-destructive" data-testid={`menu-remove-exit-${asset.id}`}>
              <Trash2 className="h-4 w-4 mr-2" /> Remove Exit
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <AddAssetDialog 
        platformId={platformId} 
        mode={platformMode}
        editAsset={asset}
        open={editOpen}
        onOpenChange={setEditOpen}
        trigger={null}
      />
      {platformMode === "asset_returns" && (
        <AssetRepaymentDialog 
          asset={asset} 
          platformId={platformId} 
          currency={currency}
          open={repaymentOpen}
          onOpenChange={setRepaymentOpen}
          trigger={null}
        />
      )}
      {platformMode === "item_valuations" && (
        <AssetValuationDialog 
          asset={asset} 
          platformId={platformId}
          open={valuationOpen}
          onOpenChange={setValuationOpen}
          trigger={null}
        />
      )}
      <AssetExitDialog 
        asset={asset} 
        platformId={platformId} 
        mode={isMaturedOrExited ? "edit" : "exit"}
        open={exitOpen}
        onOpenChange={setExitOpen}
        trigger={null}
      />
    </div>
  );
}

export default function PlatformDetails() {
  const { user } = useAuth();
  const currency = user?.currency || "EUR";

  const PlatformChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const d = payload[0]?.payload;
    // Format the tooltip header — aggregated period keys ("2025-Q1", "2025") must not be parsed as dates
    const fmtLabel = (l: unknown): string => {
      if (typeof l === 'number') { try { return format(new Date(l), 'MMM dd, yyyy'); } catch { return String(l); } }
      if (!l || typeof l !== 'string') return String(l ?? '');
      if (l.includes('-Q')) { const [y, q] = l.split('-'); return `${q} '${y.slice(2)}`; }
      if (/^\d{4}$/.test(l)) return l;
      try { return format(new Date(l), 'MMM dd, yyyy'); } catch { return l; }
    };
    return (
      <div className="rounded-xl border border-border bg-card shadow-lg px-4 py-3 text-sm min-w-[200px]">
        <p className="font-semibold text-foreground mb-2">{fmtLabel(label)}</p>
        {payload.map((entry: any) => {
          const deltaKey = entry.dataKey === 'value' ? 'valueChange'
            : entry.dataKey === 'invested' ? 'investedChange'
            : entry.dataKey === 'gain' ? 'gainChange'
            : null;
          const delta = deltaKey ? d?.[deltaKey] : null;
          const prevVal = delta != null ? entry.value - delta : null;
          const deltaPct = delta != null && delta !== 0 && prevVal != null && prevVal !== 0
            ? (delta / prevVal) * 100
            : null;
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
                    {deltaPct != null ? ` (${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%)` : ''}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const [, params] = useRoute("/platforms/:slug");
  const slug = params?.slug ? decodeURIComponent(params.slug) : "";
  const [range, setRange] = useState("year");
  const [specificYear, setSpecificYear] = useState<string | null>(null);
  const [specificMonth, setSpecificMonth] = useState<string | null>(null);
  const [chartView, setChartView] = useState<"overview" | "profit" | "monthly" | "all">("overview");
  const [chartAggregation, setChartAggregation] = useState<"month" | "quarter" | "year">("month");
  const [showAllPoints, setShowAllPoints] = useState(false);
  
  const { data: platforms } = usePlatforms();
  const id = platforms?.find(p => p.name.toLowerCase().replace(/\s+/g, '-') === slug)?.id || 0;
  const { data: platform, isLoading: isPlatformLoading } = usePlatform(id);
  const { data: investments, isLoading: isInvestmentsLoading } = useInvestments(id);
  const { data: valuations, isLoading: isValuationsLoading } = useValuations(id);
  const deleteValuation = useDeleteValuation();
  const deleteInvestment = useDeleteInvestment();
  const deleteWithdrawal = useDeleteWithdrawal();
  const { data: withdrawals, isLoading: isWithdrawalsLoading } = useWithdrawals(id);
  
  const platformMode = (platform as any)?.platformMode || "standard";
  const { data: assets, isLoading: isAssetsLoading } = useAssets(id);

  const { data: scraperConfig } = useQuery({
    queryKey: ['/api/platforms', id, 'scraper-config'],
    queryFn: async () => {
      const res = await fetch(`/api/platforms/${id}/scraper-config`, { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!id,
  });

  const isTrading212 = scraperConfig?.scraperType === "trading212";
  const isStockTicker = scraperConfig?.scraperType === "stock_ticker";

  const { data: stockInfo, isLoading: isStockInfoLoading } = useQuery({
    queryKey: ['/api/platforms', id, 'stock-info'],
    queryFn: async () => {
      const res = await fetch(`/api/platforms/${id}/stock-info`, { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isStockTicker,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const [holdingsRefreshProgress, setHoldingsRefreshProgress] = useState<string | null>(null);
  const [isHoldingsRefreshing, setIsHoldingsRefreshing] = useState(false);
  const { data: holdingsData, isLoading: isHoldingsLoading, error: holdingsError } = useQuery({
    queryKey: ['/api/platforms', id, 'trading212-holdings'],
    queryFn: async () => {
      const res = await fetch(`/api/platforms/${id}/trading212-holdings`, { credentials: 'include' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to fetch holdings");
      }
      return res.json();
    },
    enabled: isTrading212,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const refreshHoldings = useCallback(async () => {
    if (isHoldingsRefreshing) return;
    setIsHoldingsRefreshing(true);
    setHoldingsRefreshProgress("Connecting...");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(`/api/platforms/${id}/trading212-holdings-stream`, {
        credentials: 'include',
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        setHoldingsRefreshProgress("Failed to connect");
        setTimeout(() => { setIsHoldingsRefreshing(false); setHoldingsRefreshProgress(null); }, 3000);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.type === "progress") {
                setHoldingsRefreshProgress(parsed.message);
              } else if (parsed.type === "complete") {
                setHoldingsRefreshProgress("Done!");
                queryClient.setQueryData(['/api/platforms', id, 'trading212-holdings'], parsed.data);
                queryClient.invalidateQueries({ queryKey: ['/api/platforms', id, 'trading212-holdings-history'] });
                queryClient.invalidateQueries({ queryKey: ['/api/platforms', id, 'trading212-holdings-chart'] });
                setTimeout(() => { setIsHoldingsRefreshing(false); setHoldingsRefreshProgress(null); }, 1500);
                return;
              } else if (parsed.type === "error") {
                setHoldingsRefreshProgress(`Error: ${parsed.message}`);
                setTimeout(() => { setIsHoldingsRefreshing(false); setHoldingsRefreshProgress(null); }, 3000);
                return;
              }
            } catch (e) {
              // skip malformed line
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setHoldingsRefreshProgress("Connection lost");
        setTimeout(() => { setIsHoldingsRefreshing(false); setHoldingsRefreshProgress(null); }, 3000);
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, [id, isHoldingsRefreshing]);

  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null);

  const { data: holdingsHistoryDates } = useQuery({
    queryKey: ['/api/platforms', id, 'trading212-holdings-history'],
    queryFn: async () => {
      const res = await fetch(`/api/platforms/${id}/trading212-holdings-history`, { credentials: 'include' });
      if (!res.ok) return { dates: [] };
      return res.json();
    },
    enabled: isTrading212,
    staleTime: 60 * 1000,
  });

  const { data: holdingsHistorySnapshot } = useQuery({
    queryKey: ['/api/platforms', id, 'trading212-holdings-history', selectedHistoryDate],
    queryFn: async () => {
      const res = await fetch(`/api/platforms/${id}/trading212-holdings-history?date=${selectedHistoryDate}`, { credentials: 'include' });
      if (!res.ok) return { holdings: [] };
      return res.json();
    },
    enabled: isTrading212 && !!selectedHistoryDate,
    staleTime: 60 * 1000,
  });

  const { data: holdingsChartData } = useQuery({
    queryKey: ['/api/platforms', id, 'trading212-holdings-chart'],
    queryFn: async () => {
      const res = await fetch(`/api/platforms/${id}/trading212-holdings-chart`, { credentials: 'include' });
      if (!res.ok) return { chartData: [] };
      return res.json();
    },
    enabled: isTrading212,
    staleTime: 60 * 1000,
  });
  
  const [assetNameFilter, setAssetNameFilter] = useState("");
  const [assetSort, setAssetSort] = useState<"name" | "name-desc" | "date" | "date-asc" | "invested" | "invested-asc" | "value" | "value-asc" | "return" | "return-asc" | "exit" | "exit-desc" | "change" | "change-asc" | "duration" | "duration-asc" | "rpm" | "rpm-asc">("date");
  const [assetStatusFilter, setAssetStatusFilter] = useState<"all" | "active" | "exited">("all");
  
  const filteredAndSortedAssets = useMemo(() => {
    if (!assets) return [];
    
    let result = [...assets];
    
    // Filter by status
    if (assetStatusFilter === "active") {
      result = result.filter(asset => asset.status === "active");
    } else if (assetStatusFilter === "exited") {
      result = result.filter(asset => asset.status === "exited" || asset.status === "matured");
    }
    
    // Filter by name
    if (assetNameFilter.trim()) {
      const normalizedFilter = assetNameFilter.toLowerCase().trim();
      result = result.filter(asset => 
        asset.name.toLowerCase().includes(normalizedFilter)
      );
    }
    
    // Sort
    result.sort((a, b) => {
      switch (assetSort) {
        case "name":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "date":
          const dateA = a.acquisitionDate ? new Date(a.acquisitionDate).getTime() : 0;
          const dateB = b.acquisitionDate ? new Date(b.acquisitionDate).getTime() : 0;
          return dateB - dateA; // Most recent first
        case "date-asc":
          const dateA2 = a.acquisitionDate ? new Date(a.acquisitionDate).getTime() : 0;
          const dateB2 = b.acquisitionDate ? new Date(b.acquisitionDate).getTime() : 0;
          return dateA2 - dateB2; // Oldest first
        case "invested":
          const investedA = Number(a.investedAmount) + Number((a as any).bonusAmount || 0);
          const investedB = Number(b.investedAmount) + Number((b as any).bonusAmount || 0);
          return investedB - investedA; // Highest first
        case "invested-asc":
          const investedA2 = Number(a.investedAmount) + Number((a as any).bonusAmount || 0);
          const investedB2 = Number(b.investedAmount) + Number((b as any).bonusAmount || 0);
          return investedA2 - investedB2; // Lowest first
        case "value":
          const valueA = a.currentValue || Number(a.investedAmount);
          const valueB = b.currentValue || Number(b.investedAmount);
          return valueB - valueA; // Highest first
        case "value-asc":
          const valueA2 = a.currentValue || Number(a.investedAmount);
          const valueB2 = b.currentValue || Number(b.investedAmount);
          return valueA2 - valueB2; // Lowest first
        case "return":
          const returnA = a.profitLoss || 0;
          const returnB = b.profitLoss || 0;
          return returnB - returnA; // Highest return first
        case "return-asc":
          const returnA2 = a.profitLoss || 0;
          const returnB2 = b.profitLoss || 0;
          return returnA2 - returnB2; // Lowest return first
        case "exit":
          // Nearest exit first (items without exit date go to the end)
          const exitA = a.exitDate ? new Date(a.exitDate).getTime() : Infinity;
          const exitB = b.exitDate ? new Date(b.exitDate).getTime() : Infinity;
          return exitA - exitB;
        case "exit-desc":
          // Furthest exit first (items without exit date go to the end)
          const exitA2 = a.exitDate ? new Date(a.exitDate).getTime() : -Infinity;
          const exitB2 = b.exitDate ? new Date(b.exitDate).getTime() : -Infinity;
          return exitB2 - exitA2;
        case "change": {
          const curA = a.currentValue || Number(a.investedAmount);
          const prevA = (a as any).previousValue;
          const chgA = prevA !== undefined ? curA - prevA : -Infinity;
          const curB = b.currentValue || Number(b.investedAmount);
          const prevB = (b as any).previousValue;
          const chgB = prevB !== undefined ? curB - prevB : -Infinity;
          return chgB - chgA;
        }
        case "change-asc": {
          const curA3 = a.currentValue || Number(a.investedAmount);
          const prevA3 = (a as any).previousValue;
          const chgA3 = prevA3 !== undefined ? curA3 - prevA3 : Infinity;
          const curB3 = b.currentValue || Number(b.investedAmount);
          const prevB3 = (b as any).previousValue;
          const chgB3 = prevB3 !== undefined ? curB3 - prevB3 : Infinity;
          return chgA3 - chgB3;
        }
        case "duration": {
          const now = new Date();
          const endA = a.exitDate ? new Date(Math.min(new Date(a.exitDate).getTime(), now.getTime())) : now;
          const endB = b.exitDate ? new Date(Math.min(new Date(b.exitDate).getTime(), now.getTime())) : now;
          const durA = a.acquisitionDate ? endA.getTime() - new Date(a.acquisitionDate).getTime() : 0;
          const durB = b.acquisitionDate ? endB.getTime() - new Date(b.acquisitionDate).getTime() : 0;
          return durB - durA; // Longest first
        }
        case "duration-asc": {
          const now2 = new Date();
          const endA2 = a.exitDate ? new Date(Math.min(new Date(a.exitDate).getTime(), now2.getTime())) : now2;
          const endB2 = b.exitDate ? new Date(Math.min(new Date(b.exitDate).getTime(), now2.getTime())) : now2;
          const durA2 = a.acquisitionDate ? endA2.getTime() - new Date(a.acquisitionDate).getTime() : Infinity;
          const durB2 = b.acquisitionDate ? endB2.getTime() - new Date(b.acquisitionDate).getTime() : Infinity;
          return durA2 - durB2; // Shortest first
        }
        case "rpm": {
          const now3 = new Date();
          const rpmDurA = a.acquisitionDate ? (new Date(Math.min(a.exitDate ? new Date(a.exitDate).getTime() : now3.getTime(), now3.getTime())).getTime() - new Date(a.acquisitionDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44) : 0;
          const rpmDurB = b.acquisitionDate ? (new Date(Math.min(b.exitDate ? new Date(b.exitDate).getTime() : now3.getTime(), now3.getTime())).getTime() - new Date(b.acquisitionDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44) : 0;
          const invA = Number(a.investedAmount) || 0;
          const invB = Number(b.investedAmount) || 0;
          const rpmA = rpmDurA > 0 && invA > 0 ? ((a.profitLoss || 0) / invA / rpmDurA) * 100 : -Infinity;
          const rpmB = rpmDurB > 0 && invB > 0 ? ((b.profitLoss || 0) / invB / rpmDurB) * 100 : -Infinity;
          return rpmB - rpmA; // Highest first
        }
        case "rpm-asc": {
          const now4 = new Date();
          const rpmDurA2 = a.acquisitionDate ? (new Date(Math.min(a.exitDate ? new Date(a.exitDate).getTime() : now4.getTime(), now4.getTime())).getTime() - new Date(a.acquisitionDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44) : 0;
          const rpmDurB2 = b.acquisitionDate ? (new Date(Math.min(b.exitDate ? new Date(b.exitDate).getTime() : now4.getTime(), now4.getTime())).getTime() - new Date(b.acquisitionDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44) : 0;
          const invA2 = Number(a.investedAmount) || 0;
          const invB2 = Number(b.investedAmount) || 0;
          const rpmA2 = rpmDurA2 > 0 && invA2 > 0 ? ((a.profitLoss || 0) / invA2 / rpmDurA2) * 100 : Infinity;
          const rpmB2 = rpmDurB2 > 0 && invB2 > 0 ? ((b.profitLoss || 0) / invB2 / rpmDurB2) * 100 : Infinity;
          return rpmA2 - rpmB2; // Lowest first
        }
        default:
          return 0;
      }
    });
    
    return result;
  }, [assets, assetNameFilter, assetSort, assetStatusFilter]);

  const totalActivelyInvested = useMemo(() => {
    if (!assets) return 0;
    return assets
      .filter(asset => asset.status === "active")
      .reduce((sum, asset) => sum + Number(asset.investedAmount) + Number((asset as any).bonusAmount || 0), 0);
  }, [assets]);

  const totalFilteredInvested = useMemo(() => {
    return filteredAndSortedAssets.reduce((sum, asset) => sum + Number(asset.investedAmount) + Number((asset as any).bonusAmount || 0), 0);
  }, [filteredAndSortedAssets]);

  const totalFilteredValue = useMemo(() => {
    return filteredAndSortedAssets.reduce((sum, asset) => sum + Number(asset.currentValue || asset.investedAmount), 0);
  }, [filteredAndSortedAssets]);

  const assetAnalytics = useMemo(() => {
    if (!assets || assets.length === 0) return null;
    if (platformMode !== "asset_returns" && platformMode !== "item_valuations") return null;

    // Best active asset by ROI%
    const active = assets.filter(a => a.status === "active" && a.currentValue !== undefined);
    let bestActive: { name: string; roi: number } | null = null;
    for (const a of active) {
      const invested = Number(a.investedAmount) + Number(a.bonusAmount || 0);
      if (invested <= 0) continue;
      const roi = ((Number(a.currentValue) - invested) / invested) * 100;
      if (bestActive === null || roi > bestActive.roi) {
        bestActive = { name: a.name, roi };
      }
    }

    // Avg ROI on exit across all exited/matured assets (zero invested = 0% ROI)
    const exited = assets.filter(a => a.status === "exited" || a.status === "matured");
    let avgExitRoi: number | null = null;
    if (exited.length > 0) {
      const rois = exited.map(a => {
        const invested = Number(a.investedAmount);
        const pl = Number(a.profitLoss ?? 0);
        return invested > 0 ? (pl / invested) * 100 : 0;
      });
      avgExitRoi = rois.reduce((s, r) => s + r, 0) / rois.length;
    }

    // Avg holding duration (months)
    let avgDurationMonths: number | null = null;
    const exitedWithDates = exited.filter(a => a.acquisitionDate && a.exitDate);
    if (exitedWithDates.length > 0) {
      const durations = exitedWithDates.map(a => {
        const ms = new Date(a.exitDate!).getTime() - new Date(a.acquisitionDate).getTime();
        return ms / (1000 * 60 * 60 * 24 * 30.44);
      });
      avgDurationMonths = durations.reduce((s, d) => s + d, 0) / durations.length;
    }

    return { bestActive, avgExitRoi, exitedCount: exited.length, avgDurationMonths };
  }, [assets, platformMode]);

  const { data: history, isLoading: isHistoryLoading } = useQuery({
    queryKey: [api.portfolio.history.path, id, range, specificYear, specificMonth],
    queryFn: async () => {
      let url = `${api.portfolio.history.path}?range=${range}&platformId=${id}`;
      if (specificYear) url += `&year=${specificYear}`;
      if (specificMonth) url += `&month_select=${specificMonth}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch history");
      return await res.json();
    }
  });

  const platformChartData = useMemo(() => {
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

  const allPointsChartData = useMemo(() => {
    if (!history || history.length === 0) return [];
    return history.map((h: any) => ({
      date: h.date,
      value: h.value,
      invested: h.invested,
    }));
  }, [history]);

  const activeChartData = showAllPoints ? allPointsChartData : platformChartData;

  const platAggregatedData = useMemo(() => {
    if (!activeChartData || chartAggregation === "month") return null;
    type Bucket = { values: number[]; investeds: number[]; gains: number[]; monthlyChanges: number[] };
    const groups = new Map<string, Bucket>();
    activeChartData.forEach((h: any, i: number, arr: any[]) => {
      const prev = arr[i - 1];
      const monthlyChange = i === 0 ? 0 : (h.value - prev.value) - (h.invested - prev.invested);
      const d = new Date(h.date);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const key = chartAggregation === "quarter" ? `${y}-Q${Math.ceil(m / 3)}` : `${y}`;
      if (!groups.has(key)) groups.set(key, { values: [], investeds: [], gains: [], monthlyChanges: [] });
      const g = groups.get(key)!;
      g.values.push(h.value);
      g.investeds.push(h.invested);
      g.gains.push(h.value - h.invested);
      g.monthlyChanges.push(monthlyChange);
    });
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, g]) => ({
        date: key,
        value: avg(g.values),
        invested: avg(g.investeds),
        gain: avg(g.gains),
        monthlyChange: avg(g.monthlyChanges),
      }));
  }, [activeChartData, chartAggregation]);

  const platAggXFmt = (d: unknown) => {
    if (typeof d !== 'string') return String(d ?? '');
    if (chartAggregation === "quarter") {
      const [y, q] = d.split("-");
      return `${q} '${y.slice(2)}`;
    }
    if (chartAggregation === "year") return d;
    try { return format(new Date(d), 'MMM yy'); } catch { return d; }
  };

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

  const { data: availableFilters } = useQuery({
    queryKey: ['/api/portfolio/available-filters', id],
    queryFn: async () => {
      const res = await fetch(`/api/portfolio/available-filters?platformId=${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch filters");
      return await res.json();
    }
  });

  // Asset performance history for non-standard modes
  const { data: assetPerformance } = useQuery({
    queryKey: ['/api/platforms', id, 'asset-performance'],
    queryFn: async () => {
      const res = await fetch(`/api/platforms/${id}/asset-performance`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch asset performance");
      return await res.json() as { date: string; assets: { id: number; name: string; key: string; value: number }[] }[];
    },
    enabled: platformMode !== "standard"
  });

  // Monthly returns for analytics tab
  const { data: monthlyReturns, isLoading: isMonthlyReturnsLoading } = useQuery<{ month: string; prevVal: number; currVal: number; gain: number; gainPct: number | null }[]>({
    queryKey: ['/api/platforms', id, 'monthly-returns'],
    queryFn: async () => {
      const res = await fetch(`/api/platforms/${id}/monthly-returns`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch monthly returns");
      return res.json();
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });

  const [analyticsHeatmapTooltip, setAnalyticsHeatmapTooltip] = useState<{ x: number; y: number; label: string; gain: number; gainPct: number | null } | null>(null);
  const [heatmapMode, setHeatmapMode] = useState<"pct" | "value">("pct");

  const platformAnalytics = useMemo(() => {
    if (!monthlyReturns || monthlyReturns.length === 0) return null;

    // All-time ROI: uses platform aggregate totals (totalInvested, currentValue) as the
    // authoritative source — these are maintained by the server and reflect all transactions
    // including withdrawals and bonuses, making them more reliable than summing monthly gains.
    const typedPlatform = platform as PlatformResponse | null | undefined;
    const totalInvested = typedPlatform?.totalInvested ?? 0;
    const currentValue = typedPlatform?.currentValue ?? 0;
    const allTimeROI = totalInvested > 0 ? ((currentValue - totalInvested) / totalInvested) * 100 : null;

    // Annualized TWR from monthly data — annualize over validPeriods, not total months
    let twrFactor = 1;
    let validPeriods = 0;
    for (const m of monthlyReturns) {
      if (m.prevVal <= 0) continue;
      const periodReturn = m.gain / m.prevVal;
      twrFactor *= (1 + periodReturn);
      validPeriods++;
    }
    const twr = validPeriods > 0 ? (twrFactor - 1) * 100 : null;
    // Annualize over actual calendar span (first to last month), not just compounded periods
    const [fy, fm] = monthlyReturns[0].month.split('-').map(Number);
    const [ly, lm] = monthlyReturns[monthlyReturns.length - 1].month.split('-').map(Number);
    const elapsedMonths = (ly - fy) * 12 + (lm - fm) + 1;
    const yearsActive = Math.max(elapsedMonths, validPeriods) / 12;
    const annualizedTwr = twr !== null && validPeriods > 0 ? (Math.pow(twrFactor, 1 / yearsActive) - 1) * 100 : null;

    // Best/worst month
    const positiveMonths = monthlyReturns.filter(m => m.gain > 0);
    const negativeMonths = monthlyReturns.filter(m => m.gain < 0);
    const bestMonth = positiveMonths.length > 0 ? positiveMonths.reduce((best, m) => m.gain > best.gain ? m : best) : null;
    const worstMonth = negativeMonths.length > 0 ? negativeMonths.reduce((worst, m) => m.gain < worst.gain ? m : worst) : null;

    // % months positive
    const pctPositive = monthlyReturns.length > 0 ? (positiveMonths.length / monthlyReturns.length) * 100 : 0;

    // Current positive streak (consecutive positive months from the end)
    let streak = 0;
    for (let i = monthlyReturns.length - 1; i >= 0; i--) {
      if (monthlyReturns[i].gain > 0) streak++;
      else break;
    }

    // Heatmap structure
    const years = Array.from(new Set(monthlyReturns.map(m => m.month.split('-')[0]))).sort();
    const cells = monthlyReturns.map(m => {
      const [y, mo] = m.month.split('-').map(Number);
      return { year: String(y), month: mo, returnPct: m.gainPct ?? 0, rawGainPct: m.gainPct, absoluteChange: m.gain, monthKey: m.month };
    });

    const monthsActive = monthlyReturns.length;

    return { allTimeROI, twr, annualizedTwr, bestMonth, worstMonth, pctPositive, streak, monthsActive, years, cells };
  }, [monthlyReturns, platform]);

  const years = availableFilters?.years || [];
  const monthsData = availableFilters?.months?.map((m: string) => {
    const [y, mm] = m.split('-');
    const monthName = new Date(parseInt(y), parseInt(mm) - 1).toLocaleString('default', { month: 'long' });
    return { value: mm, label: monthName, year: y };
  }) || [];

  const currentYear = years[0] || new Date().getFullYear().toString();

  // Stats calculation
  const statsData = history && history.length > 0 
    ? history[history.length - 1] 
    : { value: 0, invested: 0 };

  const platformTotalInvested = statsData.invested;
  const platformCurrentValue = statsData.value;

  // Calculate monthly increase for asset_returns platforms
  const monthlyIncrease = (() => {
    if (platformMode !== "asset_returns" || !assets || assets.length === 0) return 0;
    
    let total = 0;
    
    for (const asset of assets) {
      // Skip if no yield or fully exited
      if (!asset.annualYield || asset.status === "exited") continue;
      
      const userInvested = Number(asset.investedAmount) || 0;
      const bonus = Number((asset as any).bonusAmount) || 0;
      const totalInvested = userInvested + bonus;
      const annualYield = Number(asset.annualYield) || 0;
      
      // Simple monthly yield: totalInvested × (yield/100) / 12
      const monthlyYield = (totalInvested * (annualYield / 100)) / 12;
      total += monthlyYield;
    }
    
    return Math.round(total * 100) / 100;
  })();

  if (isPlatformLoading || isInvestmentsLoading || isValuationsLoading || isWithdrawalsLoading || isHistoryLoading || isAssetsLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <Skeleton className="h-12 w-1/3" />
          <Skeleton className="h-[300px] w-full" />
          <div className="grid grid-cols-2 gap-6">
            <Skeleton className="h-[200px]" />
            <Skeleton className="h-[200px]" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!platform) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-[50vh]">
          <h2 className="text-2xl font-bold">Platform Not Found</h2>
          <Link href="/platforms" className="text-primary hover:underline mt-4">Return to Platforms</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        
        {/* Header */}
        <div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
               <PlatformIcon
                 icon={(platform as any).icon}
                 customIconUrl={(platform as any).customIconUrl}
                 color={platform.color}
                 name={platform.name}
                 size="xl"
                 className="rounded-xl shadow-lg"
               />
               <div>
                 <h1 className="text-3xl font-bold font-display tracking-tight">{platform.name}</h1>
                 <div className="text-sm text-muted-foreground">
                   {platform.category} • {(platform as any).currency || "USD"} 
                   {platformMode !== "standard" && (
                     <> • <Badge variant="outline" className="ml-1 text-xs">
                       {platformMode === "asset_returns" ? "Asset Tracking" : "Item Tracking"}
                     </Badge></>
                   )}
                 </div>
                 {(platform as any).lastValuationDate && (
                   <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-last-valuation-date">
                     Last valued {formatDistanceToNow(new Date((platform as any).lastValuationDate), { addSuffix: true })} — {format(new Date((platform as any).lastValuationDate), "MMM d, yyyy")}
                   </p>
                 )}
               </div>
            </div>
            
            <div className="flex gap-2 flex-wrap">
              <AddTransactionDialog platformId={id} type="investment" />
              <AddTransactionDialog platformId={id} type="withdrawal" />
              <AddTransactionDialog platformId={id} type="valuation" />
              {platformMode !== "standard" && (
                <AddAssetDialog 
                  platformId={id} 
                  mode={platformMode as "asset_returns" | "item_valuations"} 
                />
              )}
              <ScraperConfigDialog platformId={id} platformName={platform.name} />
              <PlatformSettingsDialog platform={platform} />
            </div>
          </div>
        </div>

        {/* Overview Stats */}
        <div className={`grid grid-cols-1 ${platformMode === "asset_returns" ? "md:grid-cols-3" : "md:grid-cols-2"} gap-6`}>
          <Card className="bg-gradient-to-br from-card to-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Current Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold font-display">
                {formatCurrency(platformCurrentValue, currency)}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-card to-muted/50">
             <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Invested</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold font-display text-muted-foreground">
                {formatCurrency(platformTotalInvested, currency)}
              </div>
            </CardContent>
          </Card>
          {platformMode === "asset_returns" && (
            <Card className="bg-gradient-to-br from-card to-muted/50" data-testid="card-monthly-increase">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Increase This Month</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold font-display text-green-600">
                  +{formatCurrency(monthlyIncrease, currency)}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {isStockTicker && (
          <Card className="bg-gradient-to-br from-card to-muted/50" data-testid="card-stock-info">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Stock Position</CardTitle>
            </CardHeader>
            <CardContent>
              {isStockInfoLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading stock data...</span>
                </div>
              ) : stockInfo ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Shares</p>
                      <p className="text-xl font-bold" data-testid="text-stock-shares">{stockInfo.shares}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Share Price ({stockInfo.stockCurrency})</p>
                      <p className="text-xl font-bold" data-testid="text-stock-price">${stockInfo.stockPrice.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">FX Rate ({stockInfo.stockCurrency}/{stockInfo.targetCurrency})</p>
                      <p className="text-xl font-bold" data-testid="text-stock-fx">{stockInfo.fxRate.toFixed(4)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Value ({stockInfo.targetCurrency})</p>
                      <p className="text-xl font-bold text-primary" data-testid="text-stock-value">{formatCurrency(stockInfo.valueInTargetCurrency, stockInfo.targetCurrency)}</p>
                    </div>
                  </div>
                  {stockInfo.averagePrice != null && (
                    <div className="border-t pt-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Average Price</p>
                          <p className="text-lg font-semibold" data-testid="text-stock-avg-price">
                            ${stockInfo.averagePrice.toFixed(2)}
                            {stockInfo.costBasisTargetCurrency != null && (
                              <span className="text-sm text-muted-foreground ml-1">
                                ({formatCurrency(stockInfo.averagePrice * stockInfo.fxRate, stockInfo.targetCurrency)})
                              </span>
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Return</p>
                          <p className={`text-lg font-semibold ${stockInfo.totalReturn != null && stockInfo.totalReturn >= 0 ? 'text-green-500' : 'text-red-500'}`} data-testid="text-stock-total-return">
                            {stockInfo.totalReturn != null ? (
                              <>{stockInfo.totalReturn >= 0 ? '+' : ''}{formatCurrency(stockInfo.totalReturn, stockInfo.targetCurrency)} ({stockInfo.totalReturnPercent?.toFixed(2)}%)</>
                            ) : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Gain / Loss</p>
                          <p className={`text-lg font-semibold ${stockInfo.gainLoss != null && stockInfo.gainLoss >= 0 ? 'text-green-500' : 'text-red-500'}`} data-testid="text-stock-gain-loss">
                            {stockInfo.gainLoss != null ? (
                              <>{stockInfo.gainLoss >= 0 ? '+' : ''}{formatCurrency(stockInfo.gainLoss, stockInfo.targetCurrency)} ({stockInfo.gainLossPercent?.toFixed(2)}%)</>
                            ) : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">FX Impact</p>
                          <p className={`text-lg font-semibold ${stockInfo.fxImpact != null && stockInfo.fxImpact >= 0 ? 'text-green-500' : 'text-red-500'}`} data-testid="text-stock-fx-impact">
                            {stockInfo.fxImpact != null ? (
                              <>{stockInfo.fxImpact >= 0 ? '+' : ''}{formatCurrency(stockInfo.fxImpact, stockInfo.targetCurrency)} ({stockInfo.fxImpactPercent?.toFixed(2)}%)</>
                            ) : '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">Could not load stock data. Configure the stock ticker scraper to get started.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Main Content Tabs */}
        <Tabs defaultValue={platformMode !== "standard" ? "assets" : "chart"} className="space-y-6">
          <TabsList>
            {platformMode !== "standard" && (
              <TabsTrigger value="assets" className="gap-2"><Package className="h-4 w-4" /> Assets</TabsTrigger>
            )}
            {platformMode === "standard" && (
              <TabsTrigger value="chart" className="gap-2"><TrendingUp className="h-4 w-4" /> Performance</TabsTrigger>
            )}
            <TabsTrigger value="investments" className="gap-2"><DollarSign className="h-4 w-4" /> Investments</TabsTrigger>
            <TabsTrigger value="valuations" className="gap-2"><History className="h-4 w-4" /> Valuations</TabsTrigger>
            {isTrading212 && (
              <TabsTrigger value="holdings" className="gap-2" data-testid="tab-holdings"><BarChart3 className="h-4 w-4" /> Holdings</TabsTrigger>
            )}
            <TabsTrigger value="analytics" className="gap-2" data-testid="tab-platform-analytics"><TrendingUp className="h-4 w-4" /> Analytics</TabsTrigger>
          </TabsList>

          {/* Assets Tab for non-standard modes */}
          {platformMode !== "standard" && (
            <TabsContent value="assets" className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle>Platform Performance</CardTitle>
                    <CardDescription>Invested vs. Valuation over time</CardDescription>
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
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <Tabs value={chartView} onValueChange={(v) => setChartView(v as any)}>
                      <TabsList>
                        <TabsTrigger value="overview">Value Overview</TabsTrigger>
                        <TabsTrigger value="profit">Profit/Loss</TabsTrigger>
                        <TabsTrigger value="monthly">Monthly Growth</TabsTrigger>
                        <TabsTrigger value="all">All</TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center border rounded-md overflow-hidden text-xs font-medium">
                        <button onClick={() => setChartAggregation("month")} className={cn("px-2.5 py-1.5 transition-colors", chartAggregation === "month" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")} data-testid="button-plat-agg-month">Mo</button>
                        <button onClick={() => setChartAggregation("quarter")} className={cn("px-2.5 py-1.5 transition-colors", chartAggregation === "quarter" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")} data-testid="button-plat-agg-quarter">Qtr</button>
                        <button onClick={() => setChartAggregation("year")} className={cn("px-2.5 py-1.5 transition-colors", chartAggregation === "year" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")} data-testid="button-plat-agg-year">Yr</button>
                      </div>
                      <Button
                        variant={showAllPoints ? "default" : "outline"}
                        size="sm"
                        onClick={() => setShowAllPoints(v => !v)}
                        className="text-xs"
                        data-testid="button-toggle-all-data-points"
                      >
                        {showAllPoints ? "Monthly view" : "All data points"}
                      </Button>
                    </div>
                  </div>
                  <div className="h-[400px] w-full">
                    {activeChartData && activeChartData.length > 0 ? (
                      platAggregatedData ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={platAggregatedData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <XAxis dataKey="date" type="category" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={platAggXFmt} interval="preserveStartEnd" />
                            {(chartView === "overview" || chartView === "all") && <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => formatAxisValue(v)} domain={['auto', 'auto']} />}
                            {(chartView === "profit" || chartView === "all") && <YAxis yAxisId="right" orientation="right" stroke="#10b981" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => formatAxisValue(v, true)} domain={['auto', 'auto']} />}
                            {(chartView === "monthly" || chartView === "all") && <YAxis yAxisId="monthly" orientation={chartView === "monthly" ? "right" : "right"} stroke="#f59e0b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => formatAxisValue(v, true)} domain={['auto', 'auto']} />}
                            <Tooltip formatter={(v: number, name: string) => [formatAxisValue(v, name === "Monthly Growth" || name === "Profit/Loss"), name]} labelFormatter={platAggXFmt} contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                            <Legend verticalAlign="top" height={36} />
                            {(chartView === "overview" || chartView === "all") && <>
                              <Line type="monotone" dataKey="value" name="Current Value" yAxisId="left" stroke={platform.color} strokeWidth={3} dot={{ r: 4, fill: platform.color, strokeWidth: 0 }} activeDot={{ r: 6 }} animationDuration={350} />
                              <Line type="monotone" dataKey="invested" name="Total Invested" yAxisId="left" stroke="#8884d8" strokeWidth={3} strokeDasharray="5 5" dot={{ r: 4, fill: '#8884d8', strokeWidth: 0 }} animationDuration={350} />
                            </>}
                            {(chartView === "profit" || chartView === "all") && <Line type="monotone" dataKey="gain" name="Profit/Loss" yAxisId="right" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }} activeDot={{ r: 6 }} animationDuration={350} />}
                            {(chartView === "monthly" || chartView === "all") && <Line type="monotone" dataKey="monthlyChange" name="Monthly Growth" yAxisId="monthly" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }} activeDot={{ r: 6 }} animationDuration={350} />}
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={activeChartData.map((h: any, i: number, arr: any[]) => {
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
                            tickFormatter={(ts) => format(new Date(ts), showAllPoints ? 'MMM dd' : 'MMM yy')}
                            ticks={(() => {
                              const seen = new Set<string>();
                              return activeChartData.filter((entry: any) => {
                                const key = showAllPoints
                                  ? format(new Date(entry.date), 'yyyy-MM-dd')
                                  : format(new Date(entry.date), 'yyyy-MM');
                                if (seen.has(key)) return false;
                                seen.add(key);
                                return true;
                              }).map((entry: any) => new Date(entry.date).getTime());
                            })()}
                          />
                          {(chartView === "overview" || chartView === "all") && (
                            <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => formatAxisValue(value)} domain={['auto', 'auto']} />
                          )}
                          {(chartView === "profit" || chartView === "all") && (
                            <YAxis yAxisId="right" orientation="right" stroke="#10b981" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => formatAxisValue(value, true)} domain={['auto', 'auto']} />
                          )}
                          {(chartView === "monthly" || chartView === "all") && (
                            <YAxis yAxisId="monthly" orientation="right" stroke="#f59e0b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => formatAxisValue(value, true)} domain={['auto', 'auto']} />
                          )}
                          <Tooltip content={<PlatformChartTooltip />} />
                          <Legend verticalAlign="top" height={36}/>
                          {(chartView === "overview" || chartView === "all") && (
                            <>
                              <Line type="monotone" dataKey="value" name="Current Value" yAxisId="left" stroke={platform.color} strokeWidth={4} dot={{ r: 5, fill: platform.color, strokeWidth: 0 }} activeDot={{ r: 7 }} />
                              <Line type="monotone" dataKey="invested" name="Total Invested" yAxisId="left" stroke="#8884d8" strokeWidth={3} strokeDasharray="5 5" dot={{ r: 5, fill: '#8884d8', strokeWidth: 0 }} />
                            </>
                          )}
                          {(chartView === "profit" || chartView === "all") && (
                            <Line type="monotone" dataKey="gain" name="Profit/Loss" yAxisId="right" stroke="#10b981" strokeWidth={chartView === "all" ? 3 : 4} dot={{ r: 5, fill: '#10b981', strokeWidth: 0 }} activeDot={{ r: 7 }} />
                          )}
                          {(chartView === "monthly" || chartView === "all") && (
                            <Line type="monotone" dataKey="monthlyChange" name="Monthly Growth" yAxisId="monthly" stroke="#f59e0b" strokeWidth={chartView === "all" ? 3 : 4} dot={{ r: 5, fill: '#f59e0b', strokeWidth: 0 }} activeDot={{ r: 7 }} />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                      )
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground">
                        No performance history available.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Combined asset insights with tabs - only for item_valuations mode */}
              {platformMode === "item_valuations" && (
                <AssetInsightTabs
                  platformId={id}
                  currency={currency}
                  totalInvested={totalActivelyInvested}
                />
              )}

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle>{platformMode === "asset_returns" ? "Assets" : "Items"}</CardTitle>
                    <CardDescription>
                      {platformMode === "asset_returns" 
                        ? "Track individual investments with their returns" 
                        : "Track items with periodic valuations"
                      }
                    </CardDescription>
                  </div>
                  <div className="text-sm text-muted-foreground flex gap-3" data-testid="text-active-invested">
                    <span>Invested: <span className="font-medium text-foreground">{formatCurrency(totalFilteredInvested, currency)}</span></span>
                    <span>Value: <span className="font-medium text-foreground">{formatCurrency(totalFilteredValue, currency)}</span></span>
                  </div>
                  <div className="flex gap-2 flex-wrap items-center">
                    <div className="flex rounded-md border overflow-hidden text-xs font-medium" data-testid="toggle-asset-status">
                      {(["all", "active", "exited"] as const).map((s) => (
                        <button
                          key={s}
                          onClick={() => setAssetStatusFilter(s)}
                          data-testid={`toggle-status-${s}`}
                          className={`px-2.5 py-1.5 capitalize transition-colors ${assetStatusFilter === s ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                        >
                          {s === "all" ? "All" : s === "active" ? "Active" : "Exited"}
                        </button>
                      ))}
                    </div>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Filter..."
                        value={assetNameFilter}
                        onChange={(e) => setAssetNameFilter(e.target.value)}
                        className="pl-8 w-24"
                        data-testid="input-filter-name"
                      />
                    </div>
                    {platformMode === "item_valuations" && (
                      <AssetValuationImportDialog platformId={id} />
                    )}
                    <AddAssetDialog 
                      platformId={id} 
                      mode={platformMode as "asset_returns" | "item_valuations"} 
                    />
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="rounded-md border">
                    <div className={`grid ${platformMode === "asset_returns" ? "grid-cols-[0.8fr_0.8fr_1.2fr_1.2fr_0.5fr_0.8fr_0.7fr_0.7fr_0.8fr_1.8fr_minmax(9rem,9rem)]" : "grid-cols-[1fr_1.5fr_1fr_0.8fr_0.7fr_0.7fr_0.8fr_1.5fr_minmax(9rem,9rem)]"} p-4 bg-muted/50 font-medium text-sm gap-2`}>
                      <button onClick={() => setAssetSort(assetSort === "date" ? "date-asc" : "date")} className="flex items-center gap-1 hover:text-foreground text-left" data-testid="sort-date">
                        Date {assetSort === "date" ? <ArrowDown className="h-3 w-3 shrink-0" /> : assetSort === "date-asc" ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-40" />}
                      </button>
                      {platformMode === "asset_returns" && (
                        <button onClick={() => setAssetSort(assetSort === "exit" ? "exit-desc" : "exit")} className="flex items-center gap-1 hover:text-foreground text-left" data-testid="sort-exit">
                          Exit {assetSort === "exit" ? <ArrowUp className="h-3 w-3 shrink-0" /> : assetSort === "exit-desc" ? <ArrowDown className="h-3 w-3 shrink-0" /> : <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-40" />}
                        </button>
                      )}
                      <button onClick={() => setAssetSort(assetSort === "name" ? "name-desc" : "name")} className="flex items-center gap-1 hover:text-foreground text-left" data-testid="sort-name">
                        Name {assetSort === "name" ? <ArrowUp className="h-3 w-3 shrink-0" /> : assetSort === "name-desc" ? <ArrowDown className="h-3 w-3 shrink-0" /> : <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-40" />}
                      </button>
                      <button onClick={() => setAssetSort(assetSort === "invested" ? "invested-asc" : "invested")} className="flex items-center gap-1 hover:text-foreground text-left" data-testid="sort-invested">
                        Invested {assetSort === "invested" ? <ArrowDown className="h-3 w-3 shrink-0" /> : assetSort === "invested-asc" ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-40" />}
                      </button>
                      {platformMode === "asset_returns" && <div>Yield</div>}
                      <button onClick={() => setAssetSort(assetSort === "value" ? "value-asc" : "value")} className="flex items-center gap-1 hover:text-foreground text-left" data-testid="sort-value">
                        Value {assetSort === "value" ? <ArrowDown className="h-3 w-3 shrink-0" /> : assetSort === "value-asc" ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-40" />}
                      </button>
                      <button onClick={() => setAssetSort(assetSort === "duration" ? "duration-asc" : "duration")} className="flex items-center gap-1 hover:text-foreground text-left" data-testid="sort-duration">
                        Duration {assetSort === "duration" ? <ArrowDown className="h-3 w-3 shrink-0" /> : assetSort === "duration-asc" ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-40" />}
                      </button>
                      <button onClick={() => setAssetSort(assetSort === "rpm" ? "rpm-asc" : "rpm")} className="flex items-center gap-1 hover:text-foreground text-left" data-testid="sort-rpm">
                        Avg/mo {assetSort === "rpm" ? <ArrowDown className="h-3 w-3 shrink-0" /> : assetSort === "rpm-asc" ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-40" />}
                      </button>
                      <button onClick={() => setAssetSort(assetSort === "change" ? "change-asc" : "change")} className="flex items-center gap-1 hover:text-foreground text-left" data-testid="sort-change">
                        Change {assetSort === "change" ? <ArrowDown className="h-3 w-3 shrink-0" /> : assetSort === "change-asc" ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-40" />}
                      </button>
                      <div>Status</div>
                      <div className="text-right">Actions</div>
                    </div>
                    <div className="divide-y">
                      {!assets || assets.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                          No {platformMode === "asset_returns" ? "assets" : "items"} recorded yet.
                        </div>
                      ) : filteredAndSortedAssets.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                          {(() => {
                            const kind = platformMode === "asset_returns" ? "assets" : "items";
                            const hasName = assetNameFilter.trim().length > 0;
                            const hasStatus = assetStatusFilter !== "all";
                            if (hasStatus && hasName) {
                              return `No ${assetStatusFilter} ${kind} matching "${assetNameFilter.trim()}"`;
                            }
                            if (hasStatus) {
                              return `No ${assetStatusFilter} ${kind} recorded yet.`;
                            }
                            return `No ${kind} matching "${assetNameFilter}"`;
                          })()}
                        </div>
                      ) : (
                        filteredAndSortedAssets.map((asset) => {
                          const assetCurrentVal = asset.currentValue || Number(asset.investedAmount);
                          const assetPrevVal = (asset as any).previousValue;
                          const assetChange = assetPrevVal !== undefined ? assetCurrentVal - assetPrevVal : null;
                          const assetChangePct = assetPrevVal !== undefined && assetPrevVal !== 0 ? (assetChange! / assetPrevVal) * 100 : null;
                          return (
                          <div 
                            key={asset.id} 
                            className={`grid ${platformMode === "asset_returns" ? "grid-cols-[0.8fr_0.8fr_1.2fr_1.2fr_0.5fr_0.8fr_0.7fr_0.7fr_0.8fr_1.8fr_minmax(9rem,9rem)]" : "grid-cols-[1fr_1.5fr_1fr_0.8fr_0.7fr_0.7fr_0.8fr_1.5fr_minmax(9rem,9rem)]"} p-4 text-sm hover:bg-muted/30 transition-colors items-center gap-2`}
                            data-testid={`row-asset-${asset.id}`}
                          >
                            <div className="text-muted-foreground">
                              {asset.acquisitionDate ? format(new Date(asset.acquisitionDate), 'MMM dd, yyyy') : '-'}
                            </div>
                            {platformMode === "asset_returns" && (
                              <div className="text-muted-foreground">
                                {asset.exitDate ? format(new Date(asset.exitDate), 'MMM dd, yyyy') : '-'}
                              </div>
                            )}
                            <div>
                              <AssetValuationManageDialog 
                                assetId={asset.id} 
                                assetName={asset.name}
                                currency={currency}
                              >
                                <div className="font-medium cursor-pointer hover:underline truncate max-w-[150px]" title={asset.name} data-testid={`link-asset-valuations-${asset.id}`}>{asset.name}</div>
                              </AssetValuationManageDialog>
                              {asset.description && (
                                <div className="text-xs text-muted-foreground">{asset.description}</div>
                              )}
                            </div>
                            <div className="font-medium">
                              {formatCurrency(Number(asset.investedAmount) + Number((asset as any).bonusAmount || 0), currency)}
                              {(asset as any).bonusAmount && Number((asset as any).bonusAmount) > 0 && (
                                <span className="text-xs text-muted-foreground ml-1">
                                  (+{formatCurrency((asset as any).bonusAmount, currency)} bonus)
                                </span>
                              )}
                              {(asset as any).totalRepaid && (asset as any).totalRepaid > 0 && (
                                <AssetRepaymentDialog
                                  asset={asset as unknown as Asset}
                                  platformId={id}
                                  currency={currency}
                                  trigger={
                                    <div className="text-xs cursor-pointer hover:underline" data-testid={`link-repayment-${asset.id}`}>
                                      <span className="text-green-600">{formatCurrency((asset as any).totalRepaid, currency)} repaid</span>
                                      <span className="text-muted-foreground"> / </span>
                                      <span className="text-muted-foreground">{formatCurrency((asset as any).remainingPrincipal || 0, currency)} remaining</span>
                                    </div>
                                  }
                                />
                              )}
                            </div>
                            {platformMode === "asset_returns" && (
                              <div className="text-muted-foreground">
                                {asset.annualYield ? `${asset.annualYield}%` : "-"}
                              </div>
                            )}
                            <div className="font-medium">
                              {formatCurrency(assetCurrentVal, currency)}
                            </div>
                            <div className="text-muted-foreground text-sm" data-testid={`text-duration-${asset.id}`}>
                              {asset.acquisitionDate
                                ? (() => {
                                    const now = new Date();
                                    const end = asset.exitDate ? new Date(Math.min(new Date(asset.exitDate).getTime(), now.getTime())) : now;
                                    return `${Math.floor((end.getTime() - new Date(asset.acquisitionDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44))}mo`;
                                  })()
                                : '-'}
                            </div>
                            <div className="text-sm" data-testid={`text-rpm-${asset.id}`}>
                              {(() => {
                                if (!asset.acquisitionDate) return <span className="text-muted-foreground">-</span>;
                                const now = new Date();
                                const durMs = (asset.exitDate ? new Date(Math.min(new Date(asset.exitDate).getTime(), now.getTime())) : now).getTime() - new Date(asset.acquisitionDate).getTime();
                                const durationMonths = durMs / (1000 * 60 * 60 * 24 * 30.44);
                                const invested = Number(asset.investedAmount) || 0;
                                if (durationMonths <= 0 || invested <= 0) return <span className="text-muted-foreground">-</span>;
                                const rpm = ((asset.profitLoss || 0) / invested / durationMonths) * 100;
                                return (
                                  <span className={rpm >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                    {rpm >= 0 ? '+' : ''}{rpm.toFixed(2)}%/mo
                                  </span>
                                );
                              })()}
                            </div>
                            <div>
                              {assetChange !== null ? (
                                <span className={assetChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                  {assetChange >= 0 ? '+' : ''}{formatCurrency(assetChange, currency)}
                                  {assetChangePct !== null && (
                                    <span className="text-xs ml-1">({assetChange >= 0 ? '+' : ''}{assetChangePct.toFixed(1)}%)</span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </div>
                            <div className="flex flex-col gap-1 items-start">
                              {asset.status === "exited" ? (
                                <Badge variant="secondary" className="gap-1 justify-start">
                                  <CheckCircle className="h-3 w-3" /> Exited
                                </Badge>
                              ) : asset.status === "matured" ? (
                                <Badge className="gap-1 bg-green-600 justify-start">
                                  <CheckCircle className="h-3 w-3" /> Matured
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="justify-start">Active</Badge>
                              )}
                              {asset.profitLoss !== undefined && (
                                <span className={`text-xs ${asset.profitLoss >= 0 ? "text-green-600" : "text-red-600"}`}>
                                  {asset.profitLoss >= 0 ? "+" : ""}{formatCurrency(asset.profitLoss, currency)}
                                  {Number(asset.investedAmount) > 0 && (
                                    <span className="ml-1">
                                      ({((asset.profitLoss / Number(asset.investedAmount)) * 100).toFixed(1)}%)
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                            <AssetActionsMenu 
                              asset={asset as unknown as Asset} 
                              platformId={id} 
                              platformMode={platformMode as "asset_returns" | "item_valuations"}
                              currency={currency}
                            />
                          </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {platformMode === "standard" && (
            <TabsContent value="chart" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle>Platform Performance</CardTitle>
                    <CardDescription>Invested vs. Valuation over time</CardDescription>
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
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <Tabs value={chartView} onValueChange={(v) => setChartView(v as any)}>
                      <TabsList>
                        <TabsTrigger value="overview" data-testid="tab-platform-chart-overview">Value Overview</TabsTrigger>
                        <TabsTrigger value="profit" data-testid="tab-platform-chart-profit">Profit/Loss</TabsTrigger>
                        <TabsTrigger value="monthly" data-testid="tab-platform-chart-monthly">Monthly Growth</TabsTrigger>
                        <TabsTrigger value="all" data-testid="tab-platform-chart-all">All</TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center border rounded-md overflow-hidden text-xs font-medium">
                        <button onClick={() => setChartAggregation("month")} className={cn("px-2.5 py-1.5 transition-colors", chartAggregation === "month" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")} data-testid="button-plat-agg-month-std">Mo</button>
                        <button onClick={() => setChartAggregation("quarter")} className={cn("px-2.5 py-1.5 transition-colors", chartAggregation === "quarter" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")} data-testid="button-plat-agg-quarter-std">Qtr</button>
                        <button onClick={() => setChartAggregation("year")} className={cn("px-2.5 py-1.5 transition-colors", chartAggregation === "year" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")} data-testid="button-plat-agg-year-std">Yr</button>
                      </div>
                      <Button
                        variant={showAllPoints ? "default" : "outline"}
                        size="sm"
                        onClick={() => setShowAllPoints(v => !v)}
                        className="text-xs"
                        data-testid="button-toggle-all-data-points-standard"
                      >
                        {showAllPoints ? "Monthly view" : "All data points"}
                      </Button>
                    </div>
                  </div>
                  <div className="h-[400px] w-full">
                    {activeChartData && activeChartData.length > 0 ? (
                      platAggregatedData ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={platAggregatedData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <XAxis dataKey="date" type="category" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={platAggXFmt} interval="preserveStartEnd" />
                            {(chartView === "overview" || chartView === "all") && <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => formatAxisValue(v)} domain={['auto', 'auto']} />}
                            {(chartView === "profit" || chartView === "all") && <YAxis yAxisId="right" orientation="right" stroke="#10b981" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => formatAxisValue(v, true)} domain={['auto', 'auto']} />}
                            {(chartView === "monthly" || chartView === "all") && <YAxis yAxisId="monthly" orientation="right" stroke="#f59e0b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => formatAxisValue(v, true)} domain={['auto', 'auto']} />}
                            <Tooltip formatter={(v: number, name: string) => [formatAxisValue(v, name === "Monthly Growth" || name === "Profit/Loss"), name]} labelFormatter={platAggXFmt} contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                            <Legend verticalAlign="top" height={36} />
                            {(chartView === "overview" || chartView === "all") && <>
                              <Line type="monotone" dataKey="value" name="Current Value" yAxisId="left" stroke={platform.color} strokeWidth={3} dot={{ r: 4, fill: platform.color, strokeWidth: 0 }} activeDot={{ r: 6 }} animationDuration={350} />
                              <Line type="monotone" dataKey="invested" name="Total Invested" yAxisId="left" stroke="#8884d8" strokeWidth={3} strokeDasharray="5 5" dot={{ r: 4, fill: '#8884d8', strokeWidth: 0 }} animationDuration={350} />
                            </>}
                            {(chartView === "profit" || chartView === "all") && <Line type="monotone" dataKey="gain" name="Profit/Loss" yAxisId="right" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }} activeDot={{ r: 6 }} animationDuration={350} />}
                            {(chartView === "monthly" || chartView === "all") && <Line type="monotone" dataKey="monthlyChange" name="Monthly Growth" yAxisId="monthly" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }} activeDot={{ r: 6 }} animationDuration={350} />}
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={activeChartData.map((h: any, i: number, arr: any[]) => {
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
                            tickFormatter={(ts) => format(new Date(ts), showAllPoints ? 'MMM dd' : 'MMM yy')}
                            ticks={(() => {
                              const seen = new Set<string>();
                              return activeChartData.filter((entry: any) => {
                                const key = showAllPoints
                                  ? format(new Date(entry.date), 'yyyy-MM-dd')
                                  : format(new Date(entry.date), 'yyyy-MM');
                                if (seen.has(key)) return false;
                                seen.add(key);
                                return true;
                              }).map((entry: any) => new Date(entry.date).getTime());
                            })()}
                          />
                          {(chartView === "overview" || chartView === "all") && (
                            <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => formatAxisValue(value)} domain={['auto', 'auto']} />
                          )}
                          {(chartView === "profit" || chartView === "all") && (
                            <YAxis yAxisId="right" orientation="right" stroke="#10b981" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => formatAxisValue(value, true)} domain={['auto', 'auto']} />
                          )}
                          {(chartView === "monthly" || chartView === "all") && (
                            <YAxis yAxisId="monthly" orientation="right" stroke="#f59e0b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => formatAxisValue(value, true)} domain={['auto', 'auto']} />
                          )}
                          <Tooltip content={<PlatformChartTooltip />} />
                          <Legend verticalAlign="top" height={36}/>
                          {(chartView === "overview" || chartView === "all") && (
                            <>
                              <Line type="monotone" dataKey="value" name="Current Value" yAxisId="left" stroke={platform.color} strokeWidth={4} dot={{ r: 5, fill: platform.color, strokeWidth: 0 }} activeDot={{ r: 7 }} />
                              <Line type="monotone" dataKey="invested" name="Total Invested" yAxisId="left" stroke="#8884d8" strokeWidth={3} strokeDasharray="5 5" dot={{ r: 5, fill: '#8884d8', strokeWidth: 0 }} />
                            </>
                          )}
                          {(chartView === "profit" || chartView === "all") && (
                            <Line type="monotone" dataKey="gain" name="Profit/Loss" yAxisId="right" stroke="#10b981" strokeWidth={chartView === "all" ? 3 : 4} dot={{ r: 5, fill: '#10b981', strokeWidth: 0 }} activeDot={{ r: 7 }} />
                          )}
                          {(chartView === "monthly" || chartView === "all") && (
                            <Line type="monotone" dataKey="monthlyChange" name="Monthly Growth" yAxisId="monthly" stroke="#f59e0b" strokeWidth={chartView === "all" ? 3 : 4} dot={{ r: 5, fill: '#f59e0b', strokeWidth: 0 }} activeDot={{ r: 7 }} />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                      )
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground">
                        No performance history available.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          <TabsContent value="investments">
            <Card>
              <CardContent className="p-0">
                <div className="rounded-md border">
                  <div className="grid grid-cols-5 p-4 bg-muted/50 font-medium text-sm">
                    <div>Date</div>
                    <div>Type</div>
                    <div>Amount</div>
                    <div>Notes</div>
                    <div className="text-right">Actions</div>
                  </div>
                  <div className="divide-y">
                    {(investments?.length === 0 && withdrawals?.length === 0) ? (
                       <div className="p-8 text-center text-muted-foreground">No transactions recorded yet.</div>
                    ) : (
                      [...(investments || []).map(inv => ({ ...inv, type: 'investment' as const })),
                       ...(withdrawals || []).map(w => ({ ...w, type: 'withdrawal' as const }))]
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .map((item) => (
                        <div key={`${item.type}-${item.id}`} className="grid grid-cols-5 p-4 text-sm hover:bg-muted/30 transition-colors items-center" data-testid={`row-${item.type}-${item.id}`}>
                          <div className="text-muted-foreground">{format(new Date(item.date), 'MMM dd, yyyy')}</div>
                          <div>
                            <Badge variant={item.type === 'investment' ? 'default' : 'secondary'}>
                              {item.type === 'investment' ? 'Deposit' : 'Withdrawal'}
                            </Badge>
                          </div>
                          <div className={`font-medium ${item.type === 'withdrawal' ? 'text-red-600' : ''}`}>
                            {item.type === 'withdrawal' ? '-' : ''}{formatCurrency(item.amount, currency)}
                            {item.type === 'investment' && (item as any).bonusAmount && Number((item as any).bonusAmount) > 0 && (
                              <span className="text-xs text-muted-foreground ml-1">
                                (+{formatCurrency((item as any).bonusAmount, currency)} bonus)
                              </span>
                            )}
                          </div>
                          <div className="text-muted-foreground truncate">{item.notes || "-"}</div>
                          <div className="flex justify-end gap-1">
                            <AddTransactionDialog 
                              platformId={id} 
                              type={item.type} 
                              mode="edit" 
                              initialData={{
                                ...item,
                                date: new Date(item.date).toISOString().split('T')[0]
                              }} 
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm(`Are you sure you want to delete this ${item.type === 'investment' ? 'deposit' : 'withdrawal'}?`)) {
                                  if (item.type === 'investment') {
                                    deleteInvestment.mutate({ id: item.id, platformId: id });
                                  } else {
                                    deleteWithdrawal.mutate({ id: item.id, platformId: id });
                                  }
                                }
                              }}
                              disabled={deleteInvestment.isPending || deleteWithdrawal.isPending}
                              data-testid={`button-delete-${item.type}-${item.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="valuations">
             <Card>
              <CardContent className="p-0">
                <div className="rounded-md border">
                  <div className="grid grid-cols-[1fr_1fr_1fr_minmax(9rem,9rem)] p-4 bg-muted/50 font-medium text-sm gap-2">
                    <div>Date</div>
                    <div>Recorded Value</div>
                    <div>Change</div>
                    <div className="text-right">Actions</div>
                  </div>
                  <div className="divide-y">
                     {valuations?.length === 0 ? (
                       <div className="p-8 text-center text-muted-foreground">No valuations recorded yet.</div>
                    ) : (
                      valuations?.map((v, idx) => {
                        const prevValuation = valuations && idx < valuations.length - 1 ? valuations[idx + 1] : null;
                        const change = prevValuation ? Number(v.value) - Number(prevValuation.value) : null;
                        const changePct = prevValuation && Number(prevValuation.value) !== 0 
                          ? (change! / Number(prevValuation.value)) * 100 
                          : null;
                        return (
                        <div key={v.id} className="grid grid-cols-[1fr_1fr_1fr_minmax(9rem,9rem)] p-4 text-sm hover:bg-muted/30 transition-colors items-center gap-2" data-testid={`row-valuation-${v.id}`}>
                          <div className="text-muted-foreground">{format(new Date(v.date), 'MMM dd, yyyy')}</div>
                          <div className="font-medium">{formatCurrency(v.value, currency)}</div>
                          <div>
                            {change !== null ? (
                              <span className={change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                {change >= 0 ? '+' : ''}{formatCurrency(change, currency)}
                                {changePct !== null && (
                                  <span className="text-xs ml-1">({change >= 0 ? '+' : ''}{changePct.toFixed(1)}%)</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </div>
                          <div className="flex justify-end gap-1">
                            <AddTransactionDialog 
                              platformId={id} 
                              type="valuation" 
                              mode="edit" 
                              initialData={{
                                ...v,
                                date: new Date(v.date).toISOString().split('T')[0]
                              }} 
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm("Are you sure you want to delete this valuation?")) {
                                  deleteValuation.mutate({ id: v.id, platformId: id });
                                }
                              }}
                              disabled={deleteValuation.isPending}
                              data-testid={`button-delete-valuation-${v.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {isTrading212 && (
            <TabsContent value="holdings" className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
                  <div>
                    <CardTitle>Holdings</CardTitle>
                    <CardDescription>
                      {holdingsData ? `${holdingsData.pieName} - ${holdingsData.instruments?.length || 0} instruments` : "Live instrument data from Trading 212"}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    {holdingsRefreshProgress && (
                      <span className="text-xs text-muted-foreground animate-pulse max-w-[250px] truncate" data-testid="text-holdings-progress">
                        {holdingsRefreshProgress}
                      </span>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="button-refresh-holdings"
                      onClick={refreshHoldings}
                      disabled={isHoldingsRefreshing}
                    >
                      {isHoldingsRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {isHoldingsLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : holdingsData ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Current Value</p>
                          <p className="text-lg font-semibold" data-testid="text-holdings-value">
                            {formatCurrency(holdingsData.currentValue, currency)}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Invested</p>
                          <p className="text-lg font-semibold" data-testid="text-holdings-invested">
                            {formatCurrency(holdingsData.investedValue, currency)}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">P/L</p>
                          <p className={`text-lg font-semibold ${holdingsData.result >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} data-testid="text-holdings-result">
                            {holdingsData.result >= 0 ? '+' : ''}{formatCurrency(holdingsData.result, currency)} ({holdingsData.resultPercent >= 0 ? '+' : ''}{holdingsData.resultPercent?.toFixed(2)}%)
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Dividends</p>
                          <p className="text-lg font-semibold text-green-600 dark:text-green-400" data-testid="text-holdings-dividends">
                            {formatCurrency(holdingsData.dividendsGained || 0, currency)}
                          </p>
                          {(holdingsData.dividendsReinvested > 0 || holdingsData.dividendsInCash > 0) && (
                            <p className="text-xs text-muted-foreground">
                              {holdingsData.dividendsReinvested > 0 && `Reinvested: ${formatCurrency(holdingsData.dividendsReinvested, currency)}`}
                              {holdingsData.dividendsReinvested > 0 && holdingsData.dividendsInCash > 0 && ' / '}
                              {holdingsData.dividendsInCash > 0 && `Cash: ${formatCurrency(holdingsData.dividendsInCash, currency)}`}
                            </p>
                          )}
                        </div>
                      </div>

                      {holdingsData.cash > 0.01 && (
                        <div className="text-sm text-muted-foreground">
                          Cash in pie: {formatCurrency(holdingsData.cash, currency)}
                        </div>
                      )}

                      <div className="rounded-md border overflow-x-auto">
                        <table className="w-full text-sm" data-testid="table-holdings">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="text-left p-3 font-medium">Ticker</th>
                              <th className="text-right p-3 font-medium">Shares</th>
                              <th className="text-right p-3 font-medium">Avg Price</th>
                              <th className="text-right p-3 font-medium">Price</th>
                              <th className="text-right p-3 font-medium">Value</th>
                              <th className="text-right p-3 font-medium">P/L</th>
                              <th className="text-right p-3 font-medium">Dividends</th>
                              <th className="text-right p-3 font-medium">Allocation</th>
                            </tr>
                          </thead>
                          <tbody>
                            {holdingsData.instruments
                              ?.sort((a: any, b: any) => (b.currentShare || 0) - (a.currentShare || 0))
                              .map((inst: any, idx: number) => {
                                const qty = inst.quantity ?? inst.shares;
                                const value = qty && inst.currentPrice ? qty * inst.currentPrice : null;
                                return (
                                  <tr key={idx} className="border-b last:border-0" data-testid={`row-holding-${idx}`}>
                                    <td className="p-3 font-medium" data-testid={`text-ticker-${idx}`}>
                                      <TickerPriceHover ticker={inst.ticker} currency={currency}>
                                        <span className="cursor-pointer underline decoration-dotted underline-offset-2">{inst.ticker}</span>
                                      </TickerPriceHover>
                                    </td>
                                    <td className="text-right p-3 tabular-nums">{qty?.toFixed(qty < 1 ? 6 : 4) ?? '-'}</td>
                                    <td className="text-right p-3 tabular-nums">
                                      {inst.averagePrice != null ? formatCurrency(inst.averagePrice, currency) : '-'}
                                    </td>
                                    <td className="text-right p-3 tabular-nums">
                                      {inst.currentPrice != null ? formatCurrency(inst.currentPrice, currency) : '-'}
                                    </td>
                                    <td className="text-right p-3 tabular-nums font-medium">
                                      {value != null ? formatCurrency(value, currency) : '-'}
                                    </td>
                                    <td className={`text-right p-3 tabular-nums ${(inst.ppl ?? inst.result ?? 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                      {(inst.ppl ?? inst.result) != null ? `${(inst.ppl ?? inst.result) >= 0 ? '+' : ''}${formatCurrency(inst.ppl ?? inst.result, currency)}` : '-'}
                                    </td>
                                    <td className="text-right p-3 tabular-nums">
                                      {inst.dividendsReceived != null ? (
                                        <Popover>
                                          <PopoverTrigger asChild>
                                            <button className="text-green-600 dark:text-green-400 underline decoration-dotted underline-offset-2 cursor-pointer bg-transparent border-none p-0 font-inherit tabular-nums" data-testid={`button-dividend-${idx}`}>
                                              {formatCurrency(inst.dividendsReceived, currency)}
                                            </button>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-80" align="end">
                                            <div className="space-y-3">
                                              <div className="flex items-center justify-between gap-2">
                                                <p className="font-medium text-sm">{inst.ticker} Dividends</p>
                                                <Badge variant="secondary" className="text-xs">{inst.dividendCount} payment{inst.dividendCount !== 1 ? 's' : ''}</Badge>
                                              </div>
                                              <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                                                {formatCurrency(inst.dividendsReceived, currency)} total
                                              </p>
                                              {inst.dividendHistory && inst.dividendHistory.length > 1 && (
                                                <div className="h-24">
                                                  <BarContainer width="100%" height="100%">
                                                    <RechartsBarChart data={inst.dividendHistory.map((d: any) => ({ date: format(new Date(d.paidOn), 'MMM yy'), amount: d.amount }))} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                                                      <BarXAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                                                      <BarTooltip formatter={(val: number) => formatCurrency(val, currency)} labelStyle={{ fontSize: 11 }} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                                                      <Bar dataKey="amount" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
                                                    </RechartsBarChart>
                                                  </BarContainer>
                                                </div>
                                              )}
                                              <div className="max-h-40 overflow-y-auto">
                                                <table className="w-full text-xs">
                                                  <thead>
                                                    <tr className="border-b">
                                                      <th className="text-left py-1 font-medium">Date</th>
                                                      <th className="text-right py-1 font-medium">Amount</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {inst.dividendHistory?.slice().reverse().map((d: any, dIdx: number) => (
                                                      <tr key={dIdx} className="border-b last:border-0">
                                                        <td className="py-1 text-muted-foreground">{format(new Date(d.paidOn), 'MMM d, yyyy')}</td>
                                                        <td className="text-right py-1 text-green-600 dark:text-green-400 tabular-nums">{formatCurrency(d.amount, currency)}</td>
                                                      </tr>
                                                    ))}
                                                  </tbody>
                                                </table>
                                              </div>
                                            </div>
                                          </PopoverContent>
                                        </Popover>
                                      ) : '-'}
                                    </td>
                                    <td className="text-right p-3 tabular-nums">{inst.currentShare?.toFixed(1)}%</td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      {holdingsError ? (
                        <p className="text-red-600 dark:text-red-400">{(holdingsError as Error).message}</p>
                      ) : (
                        <p className="text-muted-foreground">No holdings data available. Click refresh to fetch from Trading 212.</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {holdingsChartData?.chartData?.length > 1 && (() => {
                const tickers = new Set<string>();
                holdingsChartData.chartData.forEach((d: any) => {
                  Object.keys(d.instruments || {}).forEach((t: string) => tickers.add(t));
                });
                const tickerList = Array.from(tickers);
                const chartColors = [
                  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))",
                  "#f97316", "#06b6d4", "#8b5cf6", "#ec4899", "#14b8a6",
                ];
                const stackedData = holdingsChartData.chartData.map((d: any) => {
                  const row: Record<string, any> = { date: d.date };
                  let totalPpl = 0;
                  for (const t of tickerList) {
                    row[t] = d.instruments?.[t]?.value || 0;
                    totalPpl += d.instruments?.[t]?.ppl || 0;
                  }
                  row.totalPpl = totalPpl;
                  return row;
                });
                return (
                  <Card>
                    <CardHeader>
                      <CardTitle>Holdings Value Over Time</CardTitle>
                      <CardDescription>Daily breakdown by instrument</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={stackedData.map((d: any) => ({ ...d, timestamp: new Date(d.date).getTime() }))} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                            <XAxis 
                              dataKey="timestamp" 
                              type="number"
                              scale="time"
                              domain={['dataMin', 'dataMax']}
                              tick={{ fontSize: 11 }} 
                              tickFormatter={(ts) => format(new Date(ts), 'MMM d')}
                              ticks={(() => {
                                const seen = new Set<string>();
                                return stackedData.filter((entry: any) => {
                                  const key = format(new Date(entry.date), 'yyyy-MM');
                                  if (seen.has(key)) return false;
                                  seen.add(key);
                                  return true;
                                }).map((entry: any) => new Date(entry.date).getTime());
                              })()}
                            />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={(val) => `${getCurrencySymbol(currency)}${val.toFixed(0)}`} width={60} />
                            <Tooltip
                              content={(props: any) => {
                                if (!props.active || !props.payload?.length) return null;
                                const total = props.payload.reduce((s: number, e: any) => s + (e.value || 0), 0);
                                return (
                                  <div className="rounded-xl border border-border bg-card shadow-lg px-3 py-2 text-xs min-w-[180px]">
                                    <p className="font-semibold text-foreground mb-2">{props.label ? format(new Date(props.label), 'MMM d, yyyy') : ''}</p>
                                    {[...props.payload].reverse().map((entry: any) => (
                                      <div key={entry.dataKey} className="flex items-center justify-between gap-4 py-0.5">
                                        <div className="flex items-center gap-1.5">
                                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                                          <span className="text-muted-foreground">{entry.name}</span>
                                        </div>
                                        <div className="text-right">
                                          <span className="font-medium">{formatCurrency(entry.value, currency)}</span>
                                          {total > 0 && <span className="ml-1 text-muted-foreground">({((entry.value / total) * 100).toFixed(1)}%)</span>}
                                        </div>
                                      </div>
                                    ))}
                                    <div className="mt-1 pt-1 border-t border-border flex justify-between">
                                      <span className="text-muted-foreground font-medium">Total</span>
                                      <span className="font-semibold">{formatCurrency(total, currency)}</span>
                                    </div>
                                  </div>
                                );
                              }}
                            />
                            {tickerList.map((ticker, i) => (
                              <Area
                                key={ticker}
                                type="monotone"
                                dataKey={ticker}
                                stackId="1"
                                fill={chartColors[i % chartColors.length]}
                                stroke={chartColors[i % chartColors.length]}
                                fillOpacity={0.6}
                              />
                            ))}
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}

              {holdingsHistoryDates?.dates?.length > 0 && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
                    <div>
                      <CardTitle>Holdings History</CardTitle>
                      <CardDescription>Browse past snapshots ({holdingsHistoryDates.dates.length} day{holdingsHistoryDates.dates.length !== 1 ? 's' : ''} recorded)</CardDescription>
                    </div>
                    <Select
                      value={selectedHistoryDate || ""}
                      onValueChange={(val) => setSelectedHistoryDate(val || null)}
                    >
                      <SelectTrigger className="w-[180px]" data-testid="select-history-date">
                        <SelectValue placeholder="Select date" />
                      </SelectTrigger>
                      <SelectContent>
                        {holdingsHistoryDates.dates.map((d: string) => (
                          <SelectItem key={d} value={d} data-testid={`option-date-${d}`}>
                            {format(new Date(d), 'MMM d, yyyy')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardHeader>
                  <CardContent>
                    {selectedHistoryDate && holdingsHistorySnapshot?.holdings?.length > 0 ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary">
                            {format(new Date(selectedHistoryDate), 'EEEE, MMM d, yyyy')}
                          </Badge>
                          <Badge variant="outline">
                            {holdingsHistorySnapshot.holdings.length} instrument{holdingsHistorySnapshot.holdings.length !== 1 ? 's' : ''}
                          </Badge>
                          <Badge variant="outline" className="text-green-600 dark:text-green-400">
                            Total: {formatCurrency(holdingsHistorySnapshot.holdings.reduce((s: number, h: any) => s + parseFloat(h.value || "0"), 0), currency)}
                          </Badge>
                        </div>
                        <div className="rounded-md border overflow-x-auto">
                          <table className="w-full text-sm" data-testid="table-holdings-history">
                            <thead>
                              <tr className="border-b bg-muted/50">
                                <th className="text-left p-3 font-medium">Ticker</th>
                                <th className="text-right p-3 font-medium">Shares</th>
                                <th className="text-right p-3 font-medium">Avg Price</th>
                                <th className="text-right p-3 font-medium">Price</th>
                                <th className="text-right p-3 font-medium">Value</th>
                                <th className="text-right p-3 font-medium">P/L</th>
                                <th className="text-right p-3 font-medium">Allocation</th>
                              </tr>
                            </thead>
                            <tbody>
                              {holdingsHistorySnapshot.holdings.map((h: any, idx: number) => (
                                <tr key={idx} className="border-b last:border-0" data-testid={`row-history-holding-${idx}`}>
                                  <td className="p-3 font-medium">{h.ticker}</td>
                                  <td className="text-right p-3 tabular-nums">{h.shares ? parseFloat(h.shares).toFixed(parseFloat(h.shares) < 1 ? 6 : 4) : '-'}</td>
                                  <td className="text-right p-3 tabular-nums">{h.averagePrice ? formatCurrency(parseFloat(h.averagePrice), currency) : '-'}</td>
                                  <td className="text-right p-3 tabular-nums">{h.currentPrice ? formatCurrency(parseFloat(h.currentPrice), currency) : '-'}</td>
                                  <td className="text-right p-3 tabular-nums font-medium">{h.value ? formatCurrency(parseFloat(h.value), currency) : '-'}</td>
                                  <td className={`text-right p-3 tabular-nums ${parseFloat(h.ppl || "0") >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                    {h.ppl ? `${parseFloat(h.ppl) >= 0 ? '+' : ''}${formatCurrency(parseFloat(h.ppl), currency)}` : '-'}
                                  </td>
                                  <td className="text-right p-3 tabular-nums">{h.currentShare ? `${parseFloat(h.currentShare).toFixed(1)}%` : '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : selectedHistoryDate ? (
                      <p className="text-center py-4 text-muted-foreground">No snapshot data for this date</p>
                    ) : (
                      <p className="text-center py-4 text-muted-foreground">Select a date to view the holdings snapshot</p>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          )}

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
            {(isMonthlyReturnsLoading || !id) ? (
              <Card>
                <CardContent className="py-12">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Loading analytics…</span>
                  </div>
                </CardContent>
              </Card>
            ) : !platformAnalytics ? (
              <Card>
                <CardContent className="py-12">
                  <p className="text-center text-muted-foreground text-sm">Not enough history data to show analytics. Add more valuations over time to see performance metrics.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Scorecard strip */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <Card className="bg-gradient-to-br from-card to-muted/30" data-testid="analytics-stat-roi">
                    <CardContent className="pt-5 pb-4">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">All-time ROI</p>
                      <p className={`text-2xl font-bold font-display ${platformAnalytics.allTimeROI !== null ? (platformAnalytics.allTimeROI >= 0 ? 'text-emerald-500' : 'text-red-500') : ''}`}>
                        {platformAnalytics.allTimeROI !== null ? `${platformAnalytics.allTimeROI >= 0 ? '+' : ''}${platformAnalytics.allTimeROI.toFixed(2)}%` : '—'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Return on invested capital</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-card to-muted/30" data-testid="analytics-stat-twr">
                    <CardContent className="pt-5 pb-4">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Ann. Return</p>
                      <p className={`text-2xl font-bold font-display ${platformAnalytics.annualizedTwr !== null ? (platformAnalytics.annualizedTwr >= 0 ? 'text-emerald-500' : 'text-red-500') : ''}`}>
                        {platformAnalytics.annualizedTwr !== null ? `${platformAnalytics.annualizedTwr >= 0 ? '+' : ''}${platformAnalytics.annualizedTwr.toFixed(2)}%` : '—'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {platformAnalytics.twr !== null ? `${platformAnalytics.twr >= 0 ? '+' : ''}${platformAnalytics.twr.toFixed(2)}% cumulative` : 'Cash-flow adjusted'}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-card to-muted/30" data-testid="analytics-stat-best">
                    <CardContent className="pt-5 pb-4">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Best Month</p>
                      <p className="text-2xl font-bold font-display text-emerald-500">
                        {platformAnalytics.bestMonth ? `+${formatCurrency(platformAnalytics.bestMonth.gain, currency)}` : '—'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {platformAnalytics.bestMonth ? (() => {
                          const [y, m] = platformAnalytics.bestMonth.month.split('-');
                          return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m)-1]} ${y}`;
                        })() : 'No positive months yet'}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-card to-muted/30" data-testid="analytics-stat-worst">
                    <CardContent className="pt-5 pb-4">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Worst Month</p>
                      <p className="text-2xl font-bold font-display text-red-500">
                        {platformAnalytics.worstMonth ? formatCurrency(platformAnalytics.worstMonth.gain, currency) : '—'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {platformAnalytics.worstMonth ? (() => {
                          const [y, m] = platformAnalytics.worstMonth.month.split('-');
                          return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m)-1]} ${y}`;
                        })() : 'No negative months'}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-card to-muted/30" data-testid="analytics-stat-positive">
                    <CardContent className="pt-5 pb-4">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Positive Months</p>
                      <p className="text-2xl font-bold font-display text-foreground">
                        {platformAnalytics.pctPositive.toFixed(0)}%
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">of {platformAnalytics.monthsActive} months tracked</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-card to-muted/30" data-testid="analytics-stat-streak">
                    <CardContent className="pt-5 pb-4">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Current Streak</p>
                      <p className={`text-2xl font-bold font-display ${platformAnalytics.streak > 0 ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                        {platformAnalytics.streak > 0 ? `${platformAnalytics.streak}mo` : '—'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {platformAnalytics.streak > 0 ? 'consecutive positive months' : 'No active streak'}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Asset-level stat cards (only when platform has assets) */}
                {assetAnalytics && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="bg-gradient-to-br from-card to-muted/30" data-testid="analytics-stat-best-active">
                      <CardContent className="pt-5 pb-4">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Best Performance Active Asset</p>
                        <p className={`text-2xl font-bold font-display ${assetAnalytics.bestActive !== null ? (assetAnalytics.bestActive.roi >= 0 ? 'text-emerald-500' : 'text-red-500') : ''}`}>
                          {assetAnalytics.bestActive !== null
                            ? `${assetAnalytics.bestActive.roi >= 0 ? '+' : ''}${assetAnalytics.bestActive.roi.toFixed(1)}%`
                            : '—'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 truncate" title={assetAnalytics.bestActive?.name}>
                          {assetAnalytics.bestActive ? assetAnalytics.bestActive.name : 'No active assets'}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-card to-muted/30" data-testid="analytics-stat-avg-exit-roi">
                      <CardContent className="pt-5 pb-4">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Avg. Return on Exit</p>
                        <p className={`text-2xl font-bold font-display ${assetAnalytics.avgExitRoi !== null ? (assetAnalytics.avgExitRoi >= 0 ? 'text-emerald-500' : 'text-red-500') : ''}`}>
                          {assetAnalytics.avgExitRoi !== null
                            ? `${assetAnalytics.avgExitRoi >= 0 ? '+' : ''}${assetAnalytics.avgExitRoi.toFixed(1)}%`
                            : '—'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {assetAnalytics.exitedCount > 0
                            ? `across ${assetAnalytics.exitedCount} exited asset${assetAnalytics.exitedCount !== 1 ? 's' : ''}`
                            : 'No exits yet'}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-card to-muted/30" data-testid="analytics-stat-avg-duration">
                      <CardContent className="pt-5 pb-4">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Avg. Holding Duration</p>
                        <p className="text-2xl font-bold font-display text-foreground">
                          {assetAnalytics.avgDurationMonths !== null
                            ? `${assetAnalytics.avgDurationMonths.toFixed(1)} mo`
                            : '—'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {assetAnalytics.avgDurationMonths !== null
                            ? 'from acquisition to exit'
                            : assetAnalytics.exitedCount > 0
                            ? 'Insufficient date data'
                            : 'No exits yet'}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Monthly return bar chart */}
                <Card data-testid="card-monthly-return-chart">
                  <CardHeader>
                    <CardTitle>Monthly Returns</CardTitle>
                    <CardDescription>Cash-flow adjusted gain / loss per month — green = gain, red = loss</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[280px]">
                      <BarContainer width="100%" height="100%">
                        <RechartsBarChart
                          data={monthlyReturns?.map(m => {
                            const [y, mo] = m.month.split('-');
                            return {
                              label: `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(mo)-1]} ${y}`,
                              gain: m.gain,
                              gainPct: m.gainPct,
                              month: m.month,
                            };
                          }) || []}
                          margin={{ top: 4, right: 8, bottom: 8, left: 8 }}
                        >
                          <BarXAxis
                            dataKey="label"
                            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                            axisLine={false}
                            tickLine={false}
                            interval="preserveStartEnd"
                          />
                          <BarYAxis
                            tickFormatter={(v: number) => `${formatCurrency(v, currency)}`}
                            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                            axisLine={false}
                            tickLine={false}
                            width={68}
                          />
                          <BarTooltip
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.12)', fontSize: 12 }}
                            formatter={(val: number, _: string, item: { payload?: { gainPct?: number | null } }) => [
                              `${val >= 0 ? '+' : ''}${formatCurrency(val, currency)}${item.payload?.gainPct != null ? ` (${item.payload.gainPct >= 0 ? '+' : ''}${item.payload.gainPct.toFixed(2)}%)` : ''}`,
                              'Gain / Loss'
                            ]}
                          />
                          <Bar dataKey="gain" radius={[3, 3, 0, 0]}>
                            {monthlyReturns?.map((m, i) => (
                              <BarCell key={i} fill={m.gain >= 0 ? '#10b981' : '#ef4444'} />
                            ))}
                          </Bar>
                        </RechartsBarChart>
                      </BarContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Mini monthly heatmap */}
                <Card data-testid="card-monthly-heatmap">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <CardTitle>Monthly Returns Heatmap</CardTitle>
                        <CardDescription>Cash-flow adjusted return per calendar month — green = gain, red = loss</CardDescription>
                      </div>
                      <div className="flex items-center rounded-md border p-0.5 shrink-0">
                        <button
                          className={cn("px-2.5 py-1 text-xs rounded transition-colors", heatmapMode === "pct" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                          onClick={() => setHeatmapMode("pct")}
                          data-testid="heatmap-toggle-pct"
                        >%</button>
                        <button
                          className={cn("px-2.5 py-1 text-xs rounded transition-colors", heatmapMode === "value" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                          onClick={() => setHeatmapMode("value")}
                          data-testid="heatmap-toggle-value"
                        >€</button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <div className="min-w-[500px]">
                        <div className="flex mb-1">
                          <div className="w-12 shrink-0" />
                          {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map(m => (
                            <div key={m} className="flex-1 text-center text-xs text-muted-foreground font-medium">{m}</div>
                          ))}
                        </div>
                        {platformAnalytics.years.map(year => (
                          <div key={year} className="flex items-center mb-1">
                            <div className="w-12 shrink-0 text-xs text-muted-foreground font-medium pr-2 text-right">{year}</div>
                            {Array.from({ length: 12 }, (_, mi) => {
                              const monthNum = mi + 1;
                              const cell = platformAnalytics.cells.find(c => c.year === year && c.month === monthNum);
                              if (!cell) {
                                return <div key={monthNum} className="flex-1 mx-0.5 h-10 rounded bg-muted/30" />;
                              }
                              const label = `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][monthNum - 1]} ${year}`;
                              // Cells with no computable rate (e.g. first month with prevVal=0) show neutral background
                              if (cell.rawGainPct === null) {
                                return (
                                  <div
                                    key={monthNum}
                                    className="flex-1 mx-0.5 h-10 rounded flex items-center justify-center text-[10px] font-medium cursor-default bg-muted/50 text-muted-foreground"
                                    data-testid={`platform-heatmap-cell-${year}-${monthNum}`}
                                    onMouseEnter={(e) => {
                                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                      setAnalyticsHeatmapTooltip({ x: rect.left + rect.width / 2, y: rect.top, label, gain: cell.absoluteChange, gainPct: null });
                                    }}
                                    onMouseLeave={() => setAnalyticsHeatmapTooltip(null)}
                                  >
                                    —
                                  </div>
                                );
                              }
                              const intensity = Math.min(Math.abs(cell.returnPct) / 5, 1);
                              const bg = cell.returnPct >= 0
                                ? `rgba(16,185,129,${0.15 + intensity * 0.75})`
                                : `rgba(239,68,68,${0.15 + intensity * 0.75})`;
                              return (
                                <div
                                  key={monthNum}
                                  className="flex-1 mx-0.5 h-10 rounded flex items-center justify-center text-[10px] font-medium cursor-default transition-transform hover:scale-105"
                                  style={{ backgroundColor: bg, color: intensity > 0.5 ? '#fff' : undefined }}
                                  data-testid={`platform-heatmap-cell-${year}-${monthNum}`}
                                  onMouseEnter={(e) => {
                                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                    setAnalyticsHeatmapTooltip({
                                      x: rect.left + rect.width / 2,
                                      y: rect.top,
                                      label,
                                      gain: cell.absoluteChange,
                                      gainPct: cell.returnPct,
                                    });
                                  }}
                                  onMouseLeave={() => setAnalyticsHeatmapTooltip(null)}
                                >
                                  {heatmapMode === "pct"
                                  ? `${cell.returnPct >= 0 ? '+' : ''}${cell.returnPct.toFixed(1)}%`
                                  : `${cell.absoluteChange >= 0 ? '+' : ''}${formatCompactCurrency(cell.absoluteChange, currency)}`}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {analyticsHeatmapTooltip && (
                  <div
                    className="fixed z-50 pointer-events-none"
                    style={{ left: analyticsHeatmapTooltip.x, top: analyticsHeatmapTooltip.y - 8, transform: 'translate(-50%, -100%)' }}
                  >
                    <div className="bg-popover border rounded-lg shadow-lg p-3 text-xs min-w-[160px]">
                      <p className="font-semibold mb-1">{analyticsHeatmapTooltip.label}</p>
                      <div className="flex justify-between gap-4">
                        <span className={analyticsHeatmapTooltip.gainPct !== null ? (analyticsHeatmapTooltip.gainPct >= 0 ? 'text-emerald-500' : 'text-red-500') : 'text-muted-foreground'}>
                          {analyticsHeatmapTooltip.gainPct !== null
                            ? `${analyticsHeatmapTooltip.gainPct >= 0 ? '+' : ''}${analyticsHeatmapTooltip.gainPct.toFixed(2)}%`
                            : 'N/A'}
                        </span>
                        <span className="text-muted-foreground">
                          {`${analyticsHeatmapTooltip.gain >= 0 ? '+' : ''}${formatCurrency(analyticsHeatmapTooltip.gain, currency)}`}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
