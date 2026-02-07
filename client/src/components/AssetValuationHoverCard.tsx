import { useQuery } from "@tanstack/react-query";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";

interface AssetValuationHoverCardProps {
  assetId: number;
  assetName: string;
  currency: string;
  children: React.ReactNode;
}

interface AssetValuation {
  id: number;
  assetId: number;
  value: string;
  date: string;
  notes: string | null;
}

export function AssetValuationHoverCard({ assetId, assetName, currency, children }: AssetValuationHoverCardProps) {
  const currencySymbol = currency === "USD" ? "$" : "";
  const currencySuffix = currency !== "USD" ? ` ${currency}` : "";

  const { data: valuations, isLoading } = useQuery({
    queryKey: ['/api/assets', assetId, 'valuations'],
    queryFn: async () => {
      const res = await fetch(`/api/assets/${assetId}/valuations`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch valuations");
      return await res.json() as AssetValuation[];
    },
    staleTime: 60000,
  });

  const chartData = valuations
    ?.map(v => ({
      date: v.date,
      value: Number(v.value)
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) || [];

  const values = chartData.map(d => d.value);
  const minValue = values.length > 0 ? Math.min(...values) : 0;
  const maxValue = values.length > 0 ? Math.max(...values) : 0;
  const padding = (maxValue - minValue) * 0.1 || maxValue * 0.1;
  const yMin = Math.max(0, minValue - padding);
  const yMax = maxValue + padding;

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        {children}
      </HoverCardTrigger>
      <HoverCardContent className="w-80" side="top">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold truncate">{assetName}</h4>
          <p className="text-xs text-muted-foreground">Valuation History</p>
          
          {isLoading ? (
            <div className="h-32 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
              No valuation history
            </div>
          ) : chartData.length === 1 ? (
            <div className="h-32 flex flex-col items-center justify-center">
              <div className="text-lg font-bold">
                {currencySymbol}{chartData[0].value.toLocaleString()}{currencySuffix}
              </div>
              <div className="text-xs text-muted-foreground">
                {format(new Date(chartData[0].date), 'MMM dd, yyyy')}
              </div>
            </div>
          ) : (
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData.map((d: any) => ({ ...d, timestamp: new Date(d.date).getTime() }))} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                  <XAxis 
                    dataKey="timestamp" 
                    type="number"
                    scale="time"
                    domain={['dataMin', 'dataMax']}
                    tick={{ fontSize: 10 }}
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
                  <YAxis 
                    tick={{ fontSize: 10 }}
                    domain={[yMin, yMax]}
                    tickFormatter={(value) => {
                      if (value >= 1000) return `${currencySymbol}${(value / 1000).toFixed(0)}k`;
                      return `${currencySymbol}${Math.round(value)}`;
                    }}
                    width={40}
                  />
                  <Tooltip 
                    formatter={(value: number) => [
                      `${currencySymbol}${value.toLocaleString()}${currencySuffix}`,
                      "Value"
                    ]}
                    labelFormatter={(ts) => format(new Date(ts), 'MMM dd, yyyy')}
                    contentStyle={{ fontSize: '12px' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#8884d8" 
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#8884d8', strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          
          {chartData.length > 1 && (
            <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t">
              <span>First: {currencySymbol}{chartData[0].value.toLocaleString()}</span>
              <span>Latest: {currencySymbol}{chartData[chartData.length - 1].value.toLocaleString()}</span>
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
