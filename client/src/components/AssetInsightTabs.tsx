import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ItemReturnBubbleChart } from "@/components/ItemReturnBubbleChart";
import { ItemCohortReturnChart } from "@/components/ItemCohortReturnChart";
import { Dot, TrendingUp } from "lucide-react";

interface AssetInsightTabsProps {
  platformId: number;
  currency: string;
}

export function AssetInsightTabs({ platformId, currency }: AssetInsightTabsProps) {
  return (
    <Tabs defaultValue="bubbles" className="w-full">
      <TabsList className="grid w-full grid-cols-2 gap-1">
        <TabsTrigger value="bubbles" className="gap-2" data-testid="tab-bubbles">
          <Dot className="h-4 w-4" />
          <span className="hidden sm:inline">Returns</span>
        </TabsTrigger>
        <TabsTrigger value="cohorts" className="gap-2" data-testid="tab-cohorts">
          <TrendingUp className="h-4 w-4" />
          <span className="hidden sm:inline">Cohorts</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="bubbles" className="mt-4">
        <ItemReturnBubbleChart platformId={platformId} currency={currency} />
      </TabsContent>

      <TabsContent value="cohorts" className="mt-4">
        <ItemCohortReturnChart platformId={platformId} />
      </TabsContent>
    </Tabs>
  );
}
