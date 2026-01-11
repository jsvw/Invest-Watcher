import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Cell 
} from "recharts";
import { format, subMonths, isAfter } from "date-fns";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface AssetPerformancePoint {
  date: string;
  assets: { id: number; name: string; key: string; value: number }[];
}

interface AggregatedPerformancePanelProps {
  assetPerformance: AssetPerformancePoint[];
  currency: string;
}

type TimeRange = "3m" | "6m" | "12m" | "all";

export function AggregatedPerformancePanel({ assetPerformance, currency }: AggregatedPerformancePanelProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const currencySymbol = currency === "USD" ? "$" : "";
  const currencySuffix = currency !== "USD" ? ` ${currency}` : "";

  const filteredData = useMemo(() => {
    if (timeRange === "all") return assetPerformance;
    
    const monthsAgo = timeRange === "3m" ? 3 : timeRange === "6m" ? 6 : 12;
    const cutoffDate = subMonths(new Date(), monthsAgo);
    
    return assetPerformance.filter(point => 
      isAfter(new Date(point.date), cutoffDate)
    );
  }, [assetPerformance, timeRange]);

  const totalValueSeries = useMemo(() => {
    return filteredData.map(point => {
      const totalValue = point.assets.reduce((sum, a) => sum + a.value, 0);
      return {
        date: point.date,
        totalValue
      };
    });
  }, [filteredData]);

  const { currentTotal, previousTotal, changePercent, changeAmount } = useMemo(() => {
    if (totalValueSeries.length === 0) {
      return { currentTotal: 0, previousTotal: 0, changePercent: 0, changeAmount: 0 };
    }
    
    const current = totalValueSeries[totalValueSeries.length - 1]?.totalValue || 0;
    const previous = totalValueSeries[0]?.totalValue || 0;
    const change = previous > 0 ? ((current - previous) / previous) * 100 : 0;
    
    return {
      currentTotal: current,
      previousTotal: previous,
      changePercent: change,
      changeAmount: current - previous
    };
  }, [totalValueSeries]);

  const topContributors = useMemo(() => {
    if (filteredData.length === 0) return [];
    
    const latestPoint = filteredData[filteredData.length - 1];
    const total = latestPoint.assets.reduce((sum, a) => sum + a.value, 0);
    
    const sorted = [...latestPoint.assets]
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    
    const topTotal = sorted.reduce((sum, a) => sum + a.value, 0);
    const othersValue = total - topTotal;
    
    const result = sorted.map(a => ({
      name: a.name.length > 20 ? a.name.substring(0, 20) + "..." : a.name,
      fullName: a.name,
      value: a.value,
      share: total > 0 ? (a.value / total) * 100 : 0
    }));
    
    if (othersValue > 0) {
      result.push({
        name: "Others",
        fullName: "Other assets",
        value: othersValue,
        share: total > 0 ? (othersValue / total) * 100 : 0
      });
    }
    
    return result;
  }, [filteredData]);

  const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#0088fe', '#00c49f', '#ffbb28', '#ff8042', '#a4de6c', '#d0ed57', '#999999'];

  const hasAnyData = assetPerformance.length > 0;
  const hasFilteredData = totalValueSeries.length > 0;

  if (!hasAnyData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Portfolio Performance</CardTitle>
          <CardDescription>No valuation data available yet</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!hasFilteredData && timeRange !== "all") {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>Portfolio Performance</CardTitle>
            <CardDescription>No data in selected time range</CardDescription>
          </div>
          <div className="flex gap-1">
            {(["3m", "6m", "12m", "all"] as TimeRange[]).map((range) => (
              <Button
                key={range}
                variant={timeRange === range ? "default" : "outline"}
                size="sm"
                onClick={() => setTimeRange(range)}
                data-testid={`button-range-${range}`}
              >
                {range === "all" ? "All" : range.toUpperCase()}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            Try selecting a longer time range to see historical data.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>Portfolio Value Over Time</CardTitle>
            <CardDescription>Total value of all assets combined</CardDescription>
          </div>
          <div className="flex gap-1">
            {(["3m", "6m", "12m", "all"] as TimeRange[]).map((range) => (
              <Button
                key={range}
                variant={timeRange === range ? "default" : "outline"}
                size="sm"
                onClick={() => setTimeRange(range)}
                data-testid={`button-range-${range}`}
              >
                {range === "all" ? "All" : range.toUpperCase()}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="text-sm text-muted-foreground">Current Total</div>
              <div className="text-2xl font-bold" data-testid="text-current-total">
                {currencySymbol}{currentTotal.toLocaleString()}{currencySuffix}
              </div>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="text-sm text-muted-foreground">Period Start</div>
              <div className="text-2xl font-bold" data-testid="text-period-start">
                {currencySymbol}{previousTotal.toLocaleString()}{currencySuffix}
              </div>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="text-sm text-muted-foreground">Change</div>
              <div className={`text-2xl font-bold flex items-center gap-2 ${
                Math.abs(changePercent) < 0.1 ? 'text-muted-foreground' : 
                changePercent > 0 ? 'text-green-600' : 'text-red-600'
              }`} data-testid="text-change">
                {Math.abs(changePercent) < 0.1 ? <Minus className="h-5 w-5" /> : 
                 changePercent > 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                {changePercent > 0 ? '+' : ''}{changePercent.toFixed(1)}%
                <span className="text-sm font-normal">
                  ({changeAmount >= 0 ? '+' : ''}{currencySymbol}{changeAmount.toLocaleString()}{currencySuffix})
                </span>
              </div>
            </div>
          </div>
          
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={totalValueSeries}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#8884d8" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => format(new Date(value), 'MMM yy')}
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => {
                    if (value >= 1000000) return `${currencySymbol}${(value / 1000000).toFixed(1)}M`;
                    if (value >= 1000) return `${currencySymbol}${(value / 1000).toFixed(0)}k`;
                    return `${currencySymbol}${value.toFixed(0)}`;
                  }}
                />
                <Tooltip 
                  formatter={(value: number) => [
                    `${currencySymbol}${value.toLocaleString()}${currencySuffix}`,
                    "Total Value"
                  ]}
                  labelFormatter={(label) => format(new Date(label), 'MMM dd, yyyy')}
                />
                <Area 
                  type="monotone" 
                  dataKey="totalValue" 
                  stroke="#8884d8" 
                  fillOpacity={1} 
                  fill="url(#colorValue)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top Holdings</CardTitle>
          <CardDescription>Largest assets by current value</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={topContributors} 
                layout="vertical"
                margin={{ left: 10, right: 30 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={true} vertical={false} />
                <XAxis 
                  type="number"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value) => {
                    if (value >= 1000000) return `${currencySymbol}${(value / 1000000).toFixed(1)}M`;
                    if (value >= 1000) return `${currencySymbol}${(value / 1000).toFixed(0)}k`;
                    return `${currencySymbol}${value.toFixed(0)}`;
                  }}
                />
                <YAxis 
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  width={120}
                />
                <Tooltip 
                  formatter={(value: number, name: string, props: any) => [
                    `${currencySymbol}${value.toLocaleString()}${currencySuffix} (${props.payload.share.toFixed(1)}%)`,
                    props.payload.fullName
                  ]}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {topContributors.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
