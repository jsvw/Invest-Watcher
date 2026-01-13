import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface PlatformBreakdown {
  name: string;
  value: string;
  iconUrl?: string | null;
  sortValue?: number;
}

interface StatCardProps {
  title: string;
  value: string;
  subValue?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  icon: LucideIcon;
  className?: string;
  platformBreakdown?: PlatformBreakdown[];
}

export function StatCard({ title, value, subValue, trend, trendValue, icon: Icon, className, platformBreakdown }: StatCardProps) {
  const iconElement = (
    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center cursor-pointer">
      <Icon className="h-4 w-4 text-primary" />
    </div>
  );

  return (
    <Card className={cn("hover:shadow-lg transition-all duration-300 border-l-4", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {platformBreakdown && platformBreakdown.length > 0 ? (
          <HoverCard openDelay={100} closeDelay={100}>
            <HoverCardTrigger asChild>
              {iconElement}
            </HoverCardTrigger>
            <HoverCardContent className="w-64 p-3" side="bottom" align="center">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">{title}</h4>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {[...platformBreakdown].sort((a, b) => (b.sortValue ?? 0) - (a.sortValue ?? 0)).map((item, index) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                        {item.iconUrl ? (
                          <img src={item.iconUrl} alt="" className="h-4 w-4 rounded object-cover flex-shrink-0" />
                        ) : (
                          <div className="h-4 w-4 rounded bg-muted flex-shrink-0" />
                        )}
                        <span className="truncate text-muted-foreground">{item.name}</span>
                      </div>
                      <span className="font-medium ml-2 flex-shrink-0">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
        ) : (
          iconElement
        )}
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
