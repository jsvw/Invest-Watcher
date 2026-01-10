import { Layout } from "@/components/Layout";
import { AddPlatformDialog } from "@/components/AddPlatformDialog";
import { usePlatforms } from "@/hooks/use-platforms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Platforms() {
  const { data: platforms, isLoading } = usePlatforms();

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold font-display tracking-tight">Platforms</h1>
            <p className="text-muted-foreground">Manage your investment sources.</p>
          </div>
          <AddPlatformDialog />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-48 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {platforms?.map((platform) => (
              <Link key={platform.id} href={`/platforms/${platform.id}`}>
                <div className="group cursor-pointer">
                  <Card className="h-full hover:shadow-xl transition-all duration-300 border-t-4" style={{ borderTopColor: platform.color }}>
                    <CardHeader className="flex flex-row items-start justify-between">
                      <div>
                        <CardTitle className="text-xl font-bold">{platform.name}</CardTitle>
                        <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                          {platform.category}
                        </span>
                      </div>
                      <div className="p-2 bg-muted rounded-full group-hover:bg-primary group-hover:text-white transition-colors">
                        <ArrowUpRight className="h-4 w-4" />
                      </div>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Current Value</p>
                          <p className="text-xl font-bold font-display mt-1">
                            ${Number(platform.currentValue || 0).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Invested</p>
                          <p className="text-xl font-bold font-display mt-1 text-muted-foreground">
                            ${Number(platform.totalInvested || 0).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      
                      {platform.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 pt-2 border-t border-border/50">
                          {platform.description}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </Link>
            ))}
            
            {platforms?.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-muted rounded-2xl">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                  <ArrowUpRight className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold">No platforms yet</h3>
                <p className="text-muted-foreground max-w-sm mt-2">
                  Add your first investment platform to start tracking your portfolio.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
