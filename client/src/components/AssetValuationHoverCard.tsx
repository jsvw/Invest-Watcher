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
                <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => format(new Date(value), 'MMM yy')}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => {
                      if (value >= 1000) return `${currencySymbol}${(value / 1000).toFixed(0)}k`;
                      return `${currencySymbol}${value}`;
                    }}
                    width={40}
                  />
                  <Tooltip 
                    formatter={(value: number) => [
                      `${currencySymbol}${value.toLocaleString()}${currencySuffix}`,
                      "Value"
                    ]}
                    labelFormatter={(label) => format(new Date(label), 'MMM dd, yyyy')}
                    contentStyle={{ fontSize: '12px' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#8884d8" 
                    strokeWidth={2}
                    dot={{ r: 3 }}
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
