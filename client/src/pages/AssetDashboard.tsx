import { Layout } from "@/components/Layout";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { format } from "date-fns";
import { TrendingUp, DollarSign, Package, CheckCircle, Clock, ArrowRight } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Legend, PieChart, Pie, Cell } from "recharts";

interface AssetDashboardData {
  summary: {
    totalAssets: number;
    totalInvested: number;
    totalCurrentValue: number;
    totalEarnings: number;
    activeCount: number;
    maturedCount: number;
    exitedCount: number;
  };
  platformBreakdown: {
    platformId: number;
    platformName: string;
    platformColor: string;
    currency: string;
    assetCount: number;
    totalInvested: number;
    totalCurrentValue: number;
    totalEarnings: number;
    activeCount: number;
    maturedCount: number;
  }[];
  monthlyPerformance: {
    month: string;
    label: string;
    value: number;
    invested: number;
  }[];
  recentAssets: any[];
}

export default function AssetDashboard() {
  const { data, isLoading } = useQuery<AssetDashboardData>({
    queryKey: ['/api/asset-dashboard'],
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <Skeleton className="h-12 w-1/3" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="h-[400px]" />
        </div>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[50vh]">
          <p className="text-muted-foreground">No asset data available</p>
        </div>
      </Layout>
    );
  }

  const { summary, platformBreakdown, monthlyPerformance } = data;
  const roi = summary.totalInvested > 0 
    ? ((summary.totalEarnings / summary.totalInvested) * 100).toFixed(2) 
    : "0.00";

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight">Asset Dashboard</h1>
          <p className="text-muted-foreground">Track performance of all your asset-based investments</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-card to-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Total Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold font-display">${summary.totalCurrentValue.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">Invested: ${summary.totalInvested.toLocaleString()}</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-card to-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Total Earnings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold font-display text-green-600">+${summary.totalEarnings.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">ROI: {roi}%</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-card to-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Package className="h-4 w-4" /> Total Assets
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold font-display">{summary.totalAssets}</div>
              <p className="text-xs text-muted-foreground mt-1">Across {platformBreakdown.length} platforms</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-card to-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Clock className="h-4 w-4" /> Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline">{summary.activeCount} Active</Badge>
                <Badge className="bg-green-600">{summary.maturedCount} Matured</Badge>
                {summary.exitedCount > 0 && <Badge variant="secondary">{summary.exitedCount} Exited</Badge>}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Performance Over Time</CardTitle>
              <CardDescription>Asset value growth over the last 12 months</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyPerformance}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="label" 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                      tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      formatter={(value: number) => [`$${value.toLocaleString()}`, ""]}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="value" 
                      name="Current Value"
                      stroke="hsl(var(--primary))" 
                      fill="hsl(var(--primary) / 0.2)"
                      strokeWidth={2}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="invested" 
                      name="Invested"
                      stroke="#8884d8" 
                      fill="#8884d8"
                      fillOpacity={0.1}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Platform Breakdown</CardTitle>
              <CardDescription>Assets by platform</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {platformBreakdown.map((platform) => (
                  <Link key={platform.platformId} href={`/platforms/${platform.platformId}`}>
                    <div className="p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer" data-testid={`link-platform-${platform.platformId}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: platform.platformColor }}
                          />
                          <span className="font-medium">{platform.platformName}</span>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Assets:</span> {platform.assetCount}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Value:</span> ${platform.totalCurrentValue.toLocaleString()}
                        </div>
                        <div className="col-span-2">
                          <span className="text-green-600">+${platform.totalEarnings.toLocaleString()} earned</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
                {platformBreakdown.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">No asset-based platforms yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
