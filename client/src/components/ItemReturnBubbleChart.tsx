import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ReferenceLine } from "recharts";
import { formatCurrency } from "@/lib/currency";
import { format } from "date-fns";
import { useMemo } from "react";

interface BubbleDataPoint {
  assetId: number;
  assetName: string;
  date: string;
  weeksFromInvestment: number;
  percentReturn: number;
  investedBasis: number;
  currentValue: number;
}

interface ItemReturnBubbleChartProps {
  platformId: number;
  currency: string;
}

const COLORS = [
  "#8884d8", "#82ca9d", "#ffc658", "#ff7300", "#00C49F", 
  "#FFBB28", "#FF8042", "#0088FE", "#a4de6c", "#d0ed57"
];

export function ItemReturnBubbleChart({ platformId, currency }: ItemReturnBubbleChartProps) {
  const { data: bubbleData, isLoading } = useQuery<BubbleDataPoint[]>({
    queryKey: ['/api/platforms', platformId, 'item-bubbles'],
    queryFn: async () => {
      const res = await fetch(`/api/platforms/${platformId}/item-bubbles`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch bubble data");
      return await res.json();
    }
  });

  const { chartData, maxWeeks, avgReturn } = useMemo(() => {
    if (!bubbleData || bubbleData.length === 0) {
      return { chartData: [], maxWeeks: 10, avgReturn: 0 };
    }

    const uniqueAssets = Array.from(new Set(bubbleData.map(d => d.assetName)));
    const colors: Record<string, string> = {};
    uniqueAssets.forEach((name, i) => {
      colors[name] = COLORS[i % COLORS.length];
    });

    // Use weeksFromInvestment directly as x coordinate
    const data = bubbleData.map(d => ({
      ...d,
      x: d.weeksFromInvestment,
      y: d.percentReturn,
      z: d.investedBasis,
      fill: colors[d.assetName]
    }));

    // Calculate max weeks for domain
    const maxWeeksVal = Math.max(...bubbleData.map(d => d.weeksFromInvestment), 10);

    // Calculate average return for reference line
    const totalReturn = bubbleData.reduce((sum, d) => sum + d.percentReturn, 0);
    const avg = Math.round((totalReturn / bubbleData.length) * 100) / 100;

    return { chartData: data, maxWeeks: maxWeeksVal, avgReturn: avg };
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
        <CardDescription>X-axis shows weeks since investment. Bubble size represents invested amount. Avg return: {avgReturn >= 0 ? '+' : ''}{avgReturn}%</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <ScatterChart margin={{ top: 20, right: 20, bottom: 30, left: 20 }}>
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
            <ReferenceLine y={avgReturn} stroke="hsl(var(--primary))" strokeDasharray="5 5" label={{ value: `Avg: ${avgReturn}%`, position: 'right', fill: 'hsl(var(--primary))', fontSize: 12 }} />
            <Tooltip 
              cursor={{ strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const data = payload[0].payload;
                return (
                  <div className="bg-popover border rounded-lg p-3 shadow-lg">
                    <p className="font-medium">{data.assetName}</p>
                    <p className="text-sm text-muted-foreground">Week {Math.round(data.weeksFromInvestment)} ({format(new Date(data.date), 'MMM dd, yyyy')})</p>
                    <div className="mt-2 space-y-1 text-sm">
                      <p>Invested: {formatCurrency(data.investedBasis, currency)}</p>
                      <p>Value: {formatCurrency(data.currentValue, currency)}</p>
                      <p className={data.percentReturn >= 0 ? "text-green-600" : "text-red-600"}>
                        Return: {data.percentReturn >= 0 ? '+' : ''}{data.percentReturn}%
                      </p>
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
          </ScatterChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
