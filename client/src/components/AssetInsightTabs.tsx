import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AggregatedPerformancePanel } from "@/components/AggregatedPerformancePanel";
import { ItemReturnBubbleChart } from "@/components/ItemReturnBubbleChart";
import { ItemCohortReturnChart } from "@/components/ItemCohortReturnChart";
import { BarChart3, Dot, TrendingUp } from "lucide-react";

interface AssetPerformanceData {
  date: string;
  assets: { id: number; name: string; key: string; value: number }[];
}

interface AssetInsightTabsProps {
  platformId: number;
  platformMode: "asset_returns" | "item_valuations";
  currency: string;
  assetPerformance: AssetPerformanceData[] | undefined;
  totalInvested: number;
  currentValue: number;
}

export function AssetInsightTabs({ 
  platformId, 
  platformMode, 
  currency, 
  assetPerformance,
  totalInvested,
  currentValue
}: AssetInsightTabsProps) {
  const hasPerformanceData = assetPerformance && assetPerformance.length > 0;
  const isItemValuations = platformMode === "item_valuations";

  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="grid w-full grid-cols-3 gap-1">
        <TabsTrigger value="overview" className="gap-2" data-testid="tab-overview">
          <BarChart3 className="h-4 w-4" />
          <span className="hidden sm:inline">Overview</span>
        </TabsTrigger>
        {isItemValuations && (
          <TabsTrigger value="bubbles" className="gap-2" data-testid="tab-bubbles">
            <Dot className="h-4 w-4" />
            <span className="hidden sm:inline">Returns</span>
          </TabsTrigger>
        )}
        {isItemValuations && (
          <TabsTrigger value="cohorts" className="gap-2" data-testid="tab-cohorts">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Cohorts</span>
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="overview" className="mt-4">
        {hasPerformanceData ? (
          <AggregatedPerformancePanel 
            assetPerformance={assetPerformance}
            currency={currency}
            totalInvested={totalInvested}
            currentValue={currentValue}
          />
        ) : (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            No performance data available yet.
          </div>
        )}
      </TabsContent>

      {isItemValuations && (
        <TabsContent value="bubbles" className="mt-4">
          <ItemReturnBubbleChart platformId={platformId} currency={currency} />
        </TabsContent>
      )}

      {isItemValuations && (
        <TabsContent value="cohorts" className="mt-4">
          <ItemCohortReturnChart platformId={platformId} />
        </TabsContent>
      )}
    </Tabs>
  );
}
