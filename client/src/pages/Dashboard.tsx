import { Layout } from "@/components/Layout";
import { StatCard } from "@/components/StatCard";
import { usePlatforms } from "@/hooks/use-platforms";
import { useGenerateInsight } from "@/hooks/use-insights";
import { useAuth } from "@/App";
import { formatCurrency, getCurrencySymbol } from "@/lib/currency";
import { Wallet, TrendingUp, DollarSign, BrainCircuit, RefreshCcw, Filter, Check } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { Link } from "wouter";
import { format } from "date-fns";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const { user } = useAuth();
  const currency = user?.currency || "EUR";
  const { data: platforms, isLoading: isPlatformsLoading } = usePlatforms();
  const { mutate: generateInsight, data: insightData, isPending: isInsightLoading } = useGenerateInsight();
  const [range, setRange] = useState("year");
  const [specificYear, setSpecificYear] = useState<string | null>(null);
  const [specificMonth, setSpecificMonth] = useState<string | null>(null);
  const [excludedPlatforms, setExcludedPlatforms] = useState<number[]>([]);

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
    }
  });

  const { data: availableFilters } = useQuery({
    queryKey: ['/api/portfolio/available-filters'],
    queryFn: async () => {
      const res = await fetch('/api/portfolio/available-filters', { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch filters");
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
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">Dashboard</h1>
            <p className="text-muted-foreground">Your financial overview at a glance.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="default" data-testid="button-platform-filter">
                  <Filter className="h-4 w-4 mr-2" />
                  Filter Platforms
                  {excludedPlatforms.length > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {platforms?.length ? platforms.length - excludedPlatforms.length : 0}/{platforms?.length || 0}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="end">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">Select Platforms</h4>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setExcludedPlatforms([])}
                      className="h-auto py-1 px-2 text-xs"
                      data-testid="button-select-all-platforms"
                    >
                      Select All
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {platforms?.map((platform) => (
                      <div key={platform.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`platform-${platform.id}`}
                          checked={!excludedPlatforms.includes(platform.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setExcludedPlatforms(prev => prev.filter(id => id !== platform.id));
                            } else {
                              setExcludedPlatforms(prev => [...prev, platform.id]);
                            }
                          }}
                          data-testid={`checkbox-platform-${platform.id}`}
                        />
                        <Label 
                          htmlFor={`platform-${platform.id}`}
                          className="text-sm cursor-pointer flex-1"
                        >
                          {platform.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Button 
              onClick={() => generateInsight("Analyze my portfolio allocation and performance.")}
              className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white border-0 shadow-lg shadow-indigo-500/25"
              disabled={isInsightLoading}
            >
              {isInsightLoading ? <RefreshCcw className="h-4 w-4 animate-spin mr-2" /> : <BrainCircuit className="h-4 w-4 mr-2" />}
              {isInsightLoading ? "Analyzing..." : "Get AI Insights"}
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <StatCard 
            title="Total Portfolio Value" 
            value={formatCurrency(totalValue, currency)} 
            icon={Wallet} 
            className="border-l-primary"
            data-testid="stat-total-value"
          />
          <StatCard 
            title="Total Invested" 
            value={formatCurrency(totalInvested, currency)} 
            icon={DollarSign}
            className="border-l-secondary"
            data-testid="stat-total-invested"
          />
          <StatCard 
            title="Net Profit / Loss" 
            value={formatCurrency(Math.abs(netProfit), currency)} 
            trend={netProfit >= 0 ? "up" : "down"}
            trendValue={`${roi.toFixed(2)}%`}
            icon={TrendingUp}
            className={netProfit >= 0 ? "border-l-emerald-500" : "border-l-rose-500"}
            data-testid="stat-net-profit"
          />
          <StatCard 
            title="MoM Performance" 
            value={(() => {
              if (!history || history.length < 2) return "N/A";
              const current = history[history.length - 1];
              const previous = history[history.length - 2];
              const currentMoM = current.value - previous.value;
              return formatCurrency(currentMoM, currency);
            })()} 
            trend={(() => {
              if (!history || history.length < 2) return undefined;
              const current = history[history.length - 1];
              const previous = history[history.length - 2];
              const currentMoM = current.value - previous.value;
              return currentMoM >= 0 ? "up" : "down";
            })()}
            trendValue={(() => {
              if (!history || history.length < 3) return "";
              const current = history[history.length - 1];
              const previous = history[history.length - 2];
              const twoMonthsAgo = history[history.length - 3];
              const currentMoM = current.value - previous.value;
              const previousMoM = previous.value - twoMonthsAgo.value;
              const growthDiff = currentMoM - previousMoM;
              const growthPercent = previous.value > 0 ? (currentMoM / previous.value) * 100 : 0;
              const diffSign = growthDiff >= 0 ? "+" : "";
              return `${growthPercent.toFixed(1)}% | ${diffSign}${formatCurrency(growthDiff, currency)}`;
            })()}
            icon={TrendingUp}
            className={(() => {
              if (!history || history.length < 2) return "border-l-muted";
              const current = history[history.length - 1];
              const previous = history[history.length - 2];
              const currentMoM = current.value - previous.value;
              return currentMoM >= 0 ? "border-l-emerald-500" : "border-l-rose-500";
            })()}
            data-testid="stat-mom-profit"
          />
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
            <div className="h-[400px] w-full">
              {history && history.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history.map((h: any, i: number, arr: any[]) => ({ 
                    ...h, 
                    gain: h.value - h.invested,
                    monthlyChange: i === 0 ? 0 : h.value - arr[i - 1].value
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="date" 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                      tickFormatter={(date) => format(new Date(date), 'MMM yy')}
                    />
                    <YAxis 
                      yAxisId="left"
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                      tickFormatter={(value) => `${getCurrencySymbol(currency)}${(value / 1000).toFixed(0)}k`}
                    />
                    <YAxis 
                      yAxisId="monthly"
                      orientation="left"
                      stroke="#f59e0b" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                      tickFormatter={(value) => `${value >= 0 ? '+' : ''}${getCurrencySymbol(currency)}${(value / 1000).toFixed(1)}k`}
                    />
                    <YAxis 
                      yAxisId="right"
                      orientation="right"
                      stroke="#10b981" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                      tickFormatter={(value) => `${value >= 0 ? '+' : ''}${getCurrencySymbol(currency)}${(value / 1000).toFixed(0)}k`}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      formatter={(value: number, name: string) => [
                        name === "Profit/Loss" || name === "Monthly Change"
                          ? `${value >= 0 ? '+' : ''}${formatCurrency(value, currency)}`
                          : formatCurrency(value, currency), 
                        ""
                      ]}
                      labelFormatter={(label) => format(new Date(label), 'MMM dd, yyyy')}
                    />
                    <Legend verticalAlign="top" height={36}/>
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      name="Current Value"
                      yAxisId="left"
                      stroke="hsl(var(--primary))" 
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 6 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="invested" 
                      name="Total Invested"
                      yAxisId="left"
                      stroke="#8884d8" 
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="gain" 
                      name="Profit/Loss"
                      yAxisId="right"
                      stroke="#10b981" 
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: "#10b981" }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="monthlyChange" 
                      name="Monthly Change"
                      yAxisId="monthly"
                      stroke="#f59e0b" 
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: "#f59e0b" }}
                    />
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
                           <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold group-hover:scale-110 transition-transform" style={{ backgroundColor: platform.color }}>
                             {platform.name.charAt(0)}
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
