import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  subValue?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  icon: LucideIcon;
  className?: string;
}

export function StatCard({ title, value, subValue, trend, trendValue, icon: Icon, className }: StatCardProps) {
  return (
    <Card className={cn("hover:shadow-lg transition-all duration-300 border-l-4", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold font-display">{value}</div>
        {(subValue || trendValue) && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
            {subValue}
            {trendValue && (
              <span className={cn(
                "font-medium px-1.5 py-0.5 rounded",
                trend === "up" ? "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400" :
                trend === "down" ? "text-rose-600 bg-rose-100 dark:bg-rose-900/30 dark:text-rose-400" :
                "text-gray-600 bg-gray-100"
              )}>
                {trend === "up" ? "+" : ""}{trendValue}
              </span>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
