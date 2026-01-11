import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Cell 
} from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatCurrency } from "@/lib/currency";

interface AssetPerformancePoint {
  date: string;
  assets: { id: number; name: string; key: string; value: number }[];
}

interface AggregatedPerformancePanelProps {
  assetPerformance: AssetPerformancePoint[];
  currency: string;
  totalInvested?: number;
  currentValue?: number;
}

export function AggregatedPerformancePanel({ assetPerformance, currency, totalInvested = 0, currentValue = 0 }: AggregatedPerformancePanelProps) {
  const currencySymbol = currency === "USD" ? "$" : "";
  const currencySuffix = currency !== "USD" ? ` ${currency}` : "";
  
  const profitLoss = currentValue - totalInvested;
  const profitLossPercent = totalInvested > 0 ? (profitLoss / totalInvested) * 100 : 0;

  const topContributors = useMemo(() => {
    if (assetPerformance.length === 0) return [];
    
    const latestPoint = assetPerformance[assetPerformance.length - 1];
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
  }, [assetPerformance]);

  const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#0088fe', '#00c49f', '#ffbb28', '#ff8042', '#a4de6c', '#d0ed57', '#999999'];

  if (assetPerformance.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top Holdings</CardTitle>
          <CardDescription>No valuation data available yet</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {(totalInvested > 0 || currentValue > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Portfolio Summary</CardTitle>
            <CardDescription>Overall performance metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="text-sm text-muted-foreground">Total Invested</div>
                <div className="text-2xl font-bold" data-testid="text-total-invested">
                  {formatCurrency(totalInvested, currency)}
                </div>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="text-sm text-muted-foreground">Current Value</div>
                <div className="text-2xl font-bold" data-testid="text-current-value">
                  {formatCurrency(currentValue, currency)}
                </div>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="text-sm text-muted-foreground">Profit / Loss</div>
                <div className={`text-2xl font-bold flex items-center gap-2 ${
                  Math.abs(profitLossPercent) < 0.1 ? 'text-muted-foreground' : 
                  profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                }`} data-testid="text-profit-loss">
                  {Math.abs(profitLossPercent) < 0.1 ? <Minus className="h-5 w-5" /> : 
                   profitLoss >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                  {profitLoss >= 0 ? '+' : ''}{formatCurrency(profitLoss, currency)}
                  <span className="text-sm font-normal">
                    ({profitLoss >= 0 ? '+' : ''}{profitLossPercent.toFixed(1)}%)
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
