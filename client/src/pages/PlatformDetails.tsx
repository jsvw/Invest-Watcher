import { Layout } from "@/components/Layout";
import { AddTransactionDialog } from "@/components/AddTransactionDialog";
import { PlatformSettingsDialog } from "@/components/PlatformSettingsDialog";
import { usePlatform, usePlatforms } from "@/hooks/use-platforms";
import { useInvestments, useDeleteInvestment } from "@/hooks/use-investments";
import { useValuations, useDeleteValuation } from "@/hooks/use-valuations";
import { useWithdrawals, useDeleteWithdrawal } from "@/hooks/use-withdrawals";
import { useAssets, useUpdateAsset } from "@/hooks/use-assets";
import { useAuth } from "@/App";
import { formatCurrency, getCurrencySymbol } from "@/lib/currency";
import { useRoute } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, TrendingUp, History, DollarSign, Package, CheckCircle, MoreHorizontal, Pencil, LogOut, Search, ArrowUpDown, Trash2, RotateCcw, BarChart3, RefreshCw, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { format, startOfWeek, startOfMonth, addMonths } from "date-fns";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, Legend } from "recharts";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
import type { Asset } from "@shared/schema";
import { PlatformIcon } from "@/components/PlatformIcon";
import { ScraperConfigDialog } from "@/components/ScraperConfigDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BarChart as RechartsBarChart, Bar, XAxis as BarXAxis, YAxis as BarYAxis, Tooltip as BarTooltip, ResponsiveContainer as BarContainer } from "recharts";

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
  const [, params] = useRoute("/platforms/:id");
  const id = Number(params?.id);
  const [range, setRange] = useState("year");
  const [specificYear, setSpecificYear] = useState<string | null>(null);
  const [specificMonth, setSpecificMonth] = useState<string | null>(null);
  const [chartGrouping, setChartGrouping] = useState<"day" | "week" | "month">("day");
  
  const { data: platforms } = usePlatforms();
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

  const [holdingsRefreshKey, setHoldingsRefreshKey] = useState(0);
  const { data: holdingsData, isLoading: isHoldingsLoading, isFetching: isHoldingsFetching, error: holdingsError } = useQuery({
    queryKey: ['/api/platforms', id, 'trading212-holdings', holdingsRefreshKey],
    queryFn: async () => {
      const refreshParam = holdingsRefreshKey > 0 ? "?refresh=true" : "";
      const res = await fetch(`/api/platforms/${id}/trading212-holdings${refreshParam}`, { credentials: 'include' });
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
  const [assetSort, setAssetSort] = useState<"name" | "name-desc" | "date" | "date-asc" | "invested" | "invested-asc" | "value" | "value-asc" | "return" | "return-asc" | "exit" | "exit-desc">("date");
  
  const filteredAndSortedAssets = useMemo(() => {
    if (!assets) return [];
    
    let result = [...assets];
    
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
        default:
          return 0;
      }
    });
    
    return result;
  }, [assets, assetNameFilter, assetSort]);

  const totalActivelyInvested = useMemo(() => {
    if (!assets) return 0;
    return assets
      .filter(asset => asset.status === "active")
      .reduce((sum, asset) => sum + Number(asset.investedAmount) + Number((asset as any).bonusAmount || 0), 0);
  }, [assets]);

  const totalActiveCurrentValue = useMemo(() => {
    if (!assets) return 0;
    return assets
      .filter(asset => asset.status === "active")
      .reduce((sum, asset) => sum + Number(asset.currentValue || asset.investedAmount), 0);
  }, [assets]);

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

  const groupedHistory = useMemo(() => {
    if (!history || history.length === 0) {
      return (history || []).map((e: any) => ({ ...e, timestamp: new Date(e.date).getTime() }));
    }
    if (chartGrouping === "day") {
      return history.map((e: any) => ({ ...e, timestamp: new Date(e.date).getTime() }));
    }
    const groups = new Map<string, { value: number; invested: number; latestDate: string }>();
    for (const entry of history) {
      const d = new Date(entry.date);
      let key: string;
      if (chartGrouping === "week") {
        const weekStart = startOfWeek(d, { weekStartsOn: 1 });
        key = format(weekStart, 'yyyy-MM-dd');
      } else {
        key = format(d, 'yyyy-MM');
      }
      const existing = groups.get(key);
      if (!existing || entry.date > existing.latestDate) {
        groups.set(key, { value: entry.value, invested: entry.invested, latestDate: entry.date });
      }
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, data]) => {
        const date = chartGrouping === "month" ? `${key}-01` : key;
        return { date, value: data.value, invested: data.invested, timestamp: new Date(date).getTime() };
      });
  }, [history, chartGrouping]);

  const monthlyTicks = useMemo(() => {
    if (!groupedHistory || groupedHistory.length === 0) return [];
    const timestamps = groupedHistory.map((d: any) => d.timestamp);
    const minTs = Math.min(...timestamps);
    const maxTs = Math.max(...timestamps);
    const ticks: number[] = [];
    let current = startOfMonth(new Date(minTs));
    const endMonth = startOfMonth(new Date(maxTs));
    while (current.getTime() <= endMonth.getTime()) {
      ticks.push(current.getTime());
      current = addMonths(current, 1);
    }
    if (ticks.length === 0) {
      ticks.push(startOfMonth(new Date(minTs)).getTime());
    }
    return ticks;
  }, [groupedHistory]);

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
          <Link href="/platforms" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-4 transition-colors">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Platforms
          </Link>
          
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
                 <p className="text-muted-foreground">
                   {platform.category} • {(platform as any).currency || "USD"} 
                   {platformMode !== "standard" && (
                     <> • <Badge variant="outline" className="ml-1 text-xs">
                       {platformMode === "asset_returns" ? "Asset Tracking" : "Item Tracking"}
                     </Badge></>
                   )}
                 </p>
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
                    <Select value={chartGrouping} onValueChange={(val) => setChartGrouping(val as "day" | "week" | "month")}>
                      <SelectTrigger className="w-[100px] h-9" data-testid="select-chart-grouping">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="day">Day</SelectItem>
                        <SelectItem value="week">Week</SelectItem>
                        <SelectItem value="month">Month</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-[400px] w-full">
                    {groupedHistory && groupedHistory.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={groupedHistory}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis 
                            dataKey="timestamp" 
                            type="number"
                            scale="time"
                            domain={['dataMin', 'dataMax']}
                            ticks={monthlyTicks}
                            stroke="hsl(var(--muted-foreground))" 
                            fontSize={12} 
                            tickLine={false} 
                            axisLine={false} 
                            tickFormatter={(ts) => format(new Date(ts), 'MMM yy')}
                          />
                          <YAxis 
                            stroke="hsl(var(--muted-foreground))" 
                            fontSize={12} 
                            tickLine={false} 
                            axisLine={false} 
                            tickFormatter={(value) => formatCurrency(value, currency)}
                          />
                          <Tooltip 
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                            formatter={(value: number) => [formatCurrency(value, currency), ""]}
                            labelFormatter={(ts) => format(new Date(ts), 'MMM dd, yyyy')}
                          />
                          <Legend verticalAlign="top" height={36}/>
                          <Line 
                            type="monotone" 
                            dataKey="value" 
                            name="Current Value"
                            stroke={platform.color} 
                            strokeWidth={3}
                            dot={false}
                            activeDot={{ r: 6 }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="invested" 
                            name="Total Invested"
                            stroke="#8884d8" 
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
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
                    <span>Invested: <span className="font-medium text-foreground">{formatCurrency(totalActivelyInvested, currency)}</span></span>
                    <span>Value: <span className="font-medium text-foreground">{formatCurrency(totalActiveCurrentValue, currency)}</span></span>
                  </div>
                  <div className="flex gap-2 flex-wrap items-center">
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1" data-testid="button-sort">
                          <ArrowUpDown className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Sort</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => setAssetSort("name")} data-testid="sort-name">
                          {assetSort === "name" && "✓ "}Name (A-Z)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setAssetSort("name-desc")} data-testid="sort-name-desc">
                          {assetSort === "name-desc" && "✓ "}Name (Z-A)
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setAssetSort("date")} data-testid="sort-date">
                          {assetSort === "date" && "✓ "}Date (Newest)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setAssetSort("date-asc")} data-testid="sort-date-asc">
                          {assetSort === "date-asc" && "✓ "}Date (Oldest)
                        </DropdownMenuItem>
                        {platformMode === "asset_returns" && (
                          <>
                            <DropdownMenuItem onClick={() => setAssetSort("exit")} data-testid="sort-exit">
                              {assetSort === "exit" && "✓ "}Exit (Nearest)
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setAssetSort("exit-desc")} data-testid="sort-exit-desc">
                              {assetSort === "exit-desc" && "✓ "}Exit (Furthest)
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setAssetSort("invested")} data-testid="sort-invested">
                          {assetSort === "invested" && "✓ "}Invested (Highest)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setAssetSort("invested-asc")} data-testid="sort-invested-asc">
                          {assetSort === "invested-asc" && "✓ "}Invested (Lowest)
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setAssetSort("value")} data-testid="sort-value">
                          {assetSort === "value" && "✓ "}Value (Highest)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setAssetSort("value-asc")} data-testid="sort-value-asc">
                          {assetSort === "value-asc" && "✓ "}Value (Lowest)
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setAssetSort("return")} data-testid="sort-return">
                          {assetSort === "return" && "✓ "}Return (Highest)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setAssetSort("return-asc")} data-testid="sort-return-asc">
                          {assetSort === "return-asc" && "✓ "}Return (Lowest)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                    <div className={`grid ${platformMode === "asset_returns" ? "grid-cols-[0.8fr_0.8fr_1.2fr_1.2fr_0.5fr_0.8fr_1.8fr_minmax(9rem,9rem)]" : "grid-cols-[1fr_1.5fr_1fr_1fr_1.5fr_minmax(9rem,9rem)]"} p-4 bg-muted/50 font-medium text-sm gap-2`}>
                      <div>Date</div>
                      {platformMode === "asset_returns" && <div>Exit</div>}
                      <div>Name</div>
                      <div>Invested</div>
                      {platformMode === "asset_returns" && <div>Yield</div>}
                      <div>Value</div>
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
                          No {platformMode === "asset_returns" ? "assets" : "items"} matching "{assetNameFilter}"
                        </div>
                      ) : (
                        filteredAndSortedAssets.map((asset) => (
                          <div 
                            key={asset.id} 
                            className={`grid ${platformMode === "asset_returns" ? "grid-cols-[0.8fr_0.8fr_1.2fr_1.2fr_0.5fr_0.8fr_1.8fr_minmax(9rem,9rem)]" : "grid-cols-[1fr_1.5fr_1fr_1fr_1.5fr_minmax(9rem,9rem)]"} p-4 text-sm hover:bg-muted/30 transition-colors items-center gap-2`}
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
                              {formatCurrency(asset.currentValue || Number(asset.investedAmount), currency)}
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
                        ))
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
                    <Select value={chartGrouping} onValueChange={(val) => setChartGrouping(val as "day" | "week" | "month")}>
                      <SelectTrigger className="w-[100px] h-9" data-testid="select-chart-grouping-standard">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="day">Day</SelectItem>
                        <SelectItem value="week">Week</SelectItem>
                        <SelectItem value="month">Month</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-[400px] w-full">
                    {groupedHistory && groupedHistory.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={groupedHistory}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis 
                            dataKey="timestamp" 
                            type="number"
                            scale="time"
                            domain={['dataMin', 'dataMax']}
                            ticks={monthlyTicks}
                            stroke="hsl(var(--muted-foreground))" 
                            fontSize={12} 
                            tickLine={false} 
                            axisLine={false} 
                            tickFormatter={(ts) => format(new Date(ts), 'MMM yy')}
                          />
                          <YAxis 
                            stroke="hsl(var(--muted-foreground))" 
                            fontSize={12} 
                            tickLine={false} 
                            axisLine={false} 
                            tickFormatter={(value) => formatCurrency(value, currency)}
                          />
                          <Tooltip 
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                            formatter={(value: number) => [formatCurrency(value, currency), ""]}
                            labelFormatter={(ts) => format(new Date(ts), 'MMM dd, yyyy')}
                          />
                          <Legend verticalAlign="top" height={36}/>
                          <Line 
                            type="monotone" 
                            dataKey="value" 
                            name="Current Value"
                            stroke={platform.color} 
                            strokeWidth={3}
                            dot={false}
                            activeDot={{ r: 6 }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="invested" 
                            name="Total Invested"
                            stroke="#8884d8" 
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
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
                  <div className="grid grid-cols-3 p-4 bg-muted/50 font-medium text-sm">
                    <div>Date</div>
                    <div>Recorded Value</div>
                    <div className="text-right">Actions</div>
                  </div>
                  <div className="divide-y">
                     {valuations?.length === 0 ? (
                       <div className="p-8 text-center text-muted-foreground">No valuations recorded yet.</div>
                    ) : (
                      valuations?.map((v) => (
                        <div key={v.id} className="grid grid-cols-3 p-4 text-sm hover:bg-muted/30 transition-colors items-center">
                          <div className="text-muted-foreground">{format(new Date(v.date), 'MMM dd, yyyy')}</div>
                          <div className="font-medium">{formatCurrency(v.value, currency)}</div>
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
                              className="h-8 w-8 text-destructive hover:text-destructive"
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
                      ))
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
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="button-refresh-holdings"
                    onClick={() => setHoldingsRefreshKey(k => k + 1)}
                    disabled={isHoldingsFetching}
                  >
                    {isHoldingsFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
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
                                    <td className="p-3 font-medium" data-testid={`text-ticker-${idx}`}>{inst.ticker}</td>
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
                          <AreaChart data={stackedData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(val) => format(new Date(val), 'MMM d')} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={(val) => `${getCurrencySymbol(currency)}${val.toFixed(0)}`} width={60} />
                            <Tooltip
                              formatter={(val: number, name: string) => [formatCurrency(val, currency), name]}
                              labelFormatter={(label) => format(new Date(label), 'MMM d, yyyy')}
                              contentStyle={{ fontSize: 12, borderRadius: 8 }}
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
        </Tabs>
      </div>
    </Layout>
  );
}
