import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ComposedChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, Line, LineChart } from "recharts";
import { formatCurrency } from "@/lib/currency";
import { format } from "date-fns";
import { useMemo } from "react";

interface ValuationPoint {
  date: string;
  value: number;
}

interface BubbleDataPoint {
  assetId: number;
  assetName: string;
  date: string;
  weeksFromInvestment: number;
  percentReturn: number;
  investedBasis: number;
  currentValue: number;
  valuationHistory: ValuationPoint[];
}

interface ItemReturnBubbleChartProps {
  platformId: number;
  currency: string;
}

const COLORS = [
  "#8884d8", "#82ca9d", "#ffc658", "#ff7300", "#00C49F", 
  "#FFBB28", "#FF8042", "#0088FE", "#a4de6c", "#d0ed57"
];

function MiniValuationChart({ data, currency }: { data: ValuationPoint[]; currency: string }) {
  const currencySymbol = currency === "USD" ? "$" : "";
  
  if (data.length === 0) {
    return (
      <div className="h-20 flex items-center justify-center text-xs text-muted-foreground">
        No history
      </div>
    );
  }
  
  if (data.length === 1) {
    return (
      <div className="h-20 flex flex-col items-center justify-center">
        <div className="text-sm font-medium">
          {currencySymbol}{data[0].value.toLocaleString()}
        </div>
        <div className="text-xs text-muted-foreground">
          {format(new Date(data[0].date), 'MMM dd, yyyy')}
        </div>
      </div>
    );
  }

  return (
    <div className="h-24 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <XAxis 
            dataKey="date" 
            tick={{ fontSize: 9 }}
            tickFormatter={(value) => format(new Date(value), 'MMM yy')}
            interval="preserveStartEnd"
          />
          <YAxis 
            tick={{ fontSize: 9 }}
            tickFormatter={(value) => {
              if (value >= 1000) return `${currencySymbol}${(value / 1000).toFixed(0)}k`;
              return `${currencySymbol}${value}`;
            }}
            width={35}
          />
          <Line 
            type="monotone" 
            dataKey="value" 
            stroke="#8884d8" 
            strokeWidth={2}
            dot={{ r: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ItemReturnBubbleChart({ platformId, currency }: ItemReturnBubbleChartProps) {
  const { data: bubbleData, isLoading } = useQuery<BubbleDataPoint[]>({
    queryKey: ['/api/platforms', platformId, 'item-bubbles'],
    queryFn: async () => {
      const res = await fetch(`/api/platforms/${platformId}/item-bubbles`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch bubble data");
      return await res.json();
    }
  });

  const { chartData, maxWeeks, monthlyAvgData } = useMemo(() => {
    if (!bubbleData || bubbleData.length === 0) {
      return { chartData: [], maxWeeks: 10, monthlyAvgData: [] };
    }

    const uniqueAssets = Array.from(new Set(bubbleData.map(d => d.assetName)));
    const colors: Record<string, string> = {};
    uniqueAssets.forEach((name, i) => {
      colors[name] = COLORS[i % COLORS.length];
    });

    const data = bubbleData.map(d => ({
      ...d,
      x: d.weeksFromInvestment,
      y: d.percentReturn,
      z: d.investedBasis,
      fill: colors[d.assetName]
    }));

    const maxWeeksVal = Math.max(...bubbleData.map(d => d.weeksFromInvestment), 10);

    // Calculate monthly average (group by 4-week buckets)
    const weeksPerMonth = 4;
    const monthBuckets = new Map<number, number[]>();
    
    bubbleData.forEach(d => {
      const monthBucket = Math.floor(d.weeksFromInvestment / weeksPerMonth);
      if (!monthBuckets.has(monthBucket)) {
        monthBuckets.set(monthBucket, []);
      }
      monthBuckets.get(monthBucket)!.push(d.percentReturn);
    });

    // Convert to array for the line chart, sorted by month
    const monthlyAvg = Array.from(monthBuckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([monthBucket, returns]) => ({
        x: monthBucket * weeksPerMonth + weeksPerMonth / 2, // center of the bucket
        avgReturn: Math.round((returns.reduce((s, r) => s + r, 0) / returns.length) * 100) / 100
      }));

    return { chartData: data, maxWeeks: maxWeeksVal, monthlyAvgData: monthlyAvg };
  }, [bubbleData]);

  if (isLoading) {
    return (
      <Card data-testid="card-item-return-bubbles">
        <CardHeader>
          <CardTitle>Item Returns Over Time</CardTitle>
          <CardDescription>Loading chart data...</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!bubbleData || bubbleData.length === 0) {
    return (
      <Card data-testid="card-item-return-bubbles">
        <CardHeader>
          <CardTitle>Item Returns Over Time</CardTitle>
          <CardDescription>Track how each item's value changes over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            No valuation data recorded yet. Add valuations to see the return chart.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-item-return-bubbles">
      <CardHeader>
        <CardTitle>Item Returns Over Investment Time</CardTitle>
        <CardDescription>X-axis shows weeks since investment. Bubble size represents invested amount. Dashed line shows monthly average.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart margin={{ top: 20, right: 20, bottom: 30, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              type="number"
              dataKey="x"
              name="Weeks"
              domain={[0, Math.ceil(maxWeeks * 1.1)]}
              tickFormatter={(val) => `${Math.round(val)}w`}
              className="text-xs fill-muted-foreground"
              label={{ value: 'Weeks since investment', position: 'insideBottom', offset: -15, className: 'fill-muted-foreground text-xs' }}
            />
            <YAxis 
              type="number"
              dataKey="y"
              name="Return"
              className="text-xs fill-muted-foreground"
              tickFormatter={(val) => `${val > 0 ? '+' : ''}${val}%`}
            />
            <ZAxis 
              type="number"
              dataKey="z"
              range={[100, 800]}
              name="Invested"
            />
            <Line 
              data={monthlyAvgData}
              type="monotone"
              dataKey="avgReturn"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ fill: 'hsl(var(--primary))', r: 4 }}
              name="Monthly Avg"
            />
            <Tooltip 
              cursor={{ strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const data = payload[0].payload;
                
                // Check if this is a monthly average point (no assetName)
                if (data.avgReturn !== undefined && !data.assetName) {
                  return (
                    <div className="bg-popover border rounded-lg p-3 shadow-lg">
                      <p className="font-medium">Monthly Average</p>
                      <p className="text-sm">Week {Math.round(data.x)}: {data.avgReturn >= 0 ? '+' : ''}{data.avgReturn}%</p>
                    </div>
                  );
                }
                
                return (
                  <div className="bg-popover border rounded-lg p-3 shadow-lg w-64">
                    <p className="font-medium truncate">{data.assetName}</p>
                    <p className="text-xs text-muted-foreground mb-2">Valuation History</p>
                    <MiniValuationChart data={data.valuationHistory || []} currency={currency} />
                    <div className="mt-2 pt-2 border-t space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Invested:</span>
                        <span>{formatCurrency(data.investedBasis, currency)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Current:</span>
                        <span>{formatCurrency(data.currentValue, currency)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Return:</span>
                        <span className={data.percentReturn >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                          {data.percentReturn >= 0 ? '+' : ''}{data.percentReturn}%
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Week {Math.round(data.weeksFromInvestment)}</span>
                        <span>{format(new Date(data.date), 'MMM dd, yyyy')}</span>
                      </div>
                    </div>
                  </div>
                );
              }}
            />
            <Scatter 
              data={chartData} 
              name="Items"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} fillOpacity={0.8} stroke={entry.fill} strokeWidth={1} />
              ))}
            </Scatter>
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
