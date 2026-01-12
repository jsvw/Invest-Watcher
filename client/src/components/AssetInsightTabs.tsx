import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ItemReturnBubbleChart } from "@/components/ItemReturnBubbleChart";
import { ItemCohortReturnChart } from "@/components/ItemCohortReturnChart";
import { Dot, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { useState } from "react";

export type AssetStatusFilter = "all" | "active" | "exited";

interface AssetInsightTabsProps {
  platformId: number;
  currency: string;
  totalInvested: number;
}

export function AssetInsightTabs({ platformId, currency, totalInvested }: AssetInsightTabsProps) {
  const [statusFilter, setStatusFilter] = useState<AssetStatusFilter>("all");

  return (
    <Tabs defaultValue="bubbles" className="w-full">
      <div className="flex items-center justify-between gap-4 mb-2 flex-wrap">
        <div className="flex items-center gap-4 flex-wrap">
          <TabsList className="grid grid-cols-2 gap-1">
            <TabsTrigger value="bubbles" className="gap-2" data-testid="tab-bubbles">
              <Dot className="h-4 w-4" />
              <span className="hidden sm:inline">Returns</span>
            </TabsTrigger>
            <TabsTrigger value="cohorts" className="gap-2" data-testid="tab-cohorts">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Cohorts</span>
            </TabsTrigger>
          </TabsList>
          <ToggleGroup 
            type="single" 
            value={statusFilter} 
            onValueChange={(val) => val && setStatusFilter(val as AssetStatusFilter)}
            className="border rounded-md"
          >
            <ToggleGroupItem value="all" size="sm" data-testid="filter-all">
              All
            </ToggleGroupItem>
            <ToggleGroupItem value="active" size="sm" data-testid="filter-active">
              Active
            </ToggleGroupItem>
            <ToggleGroupItem value="exited" size="sm" data-testid="filter-exited">
              Exited
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="text-sm text-muted-foreground" data-testid="text-total-invested">
          Total Invested: <span className="font-medium text-foreground">{formatCurrency(totalInvested, currency)}</span>
        </div>
      </div>

      <TabsContent value="bubbles" className="mt-4">
        <ItemReturnBubbleChart platformId={platformId} currency={currency} statusFilter={statusFilter} />
      </TabsContent>

      <TabsContent value="cohorts" className="mt-4">
        <ItemCohortReturnChart platformId={platformId} statusFilter={statusFilter} />
      </TabsContent>
    </Tabs>
  );
}
