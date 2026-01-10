import { Layout } from "@/components/Layout";
import { AddTransactionDialog } from "@/components/AddTransactionDialog";
import { usePlatform } from "@/hooks/use-platforms";
import { useInvestments } from "@/hooks/use-investments";
import { useValuations } from "@/hooks/use-valuations";
import { useRoute } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, TrendingUp, History, DollarSign } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function PlatformDetails() {
  const [, params] = useRoute("/platforms/:id");
  const id = Number(params?.id);
  
  const { data: platform, isLoading: isPlatformLoading } = usePlatform(id);
  const { data: investments, isLoading: isInvestmentsLoading } = useInvestments(id);
  const { data: valuations, isLoading: isValuationsLoading } = useValuations(id);

  if (isPlatformLoading || isInvestmentsLoading || isValuationsLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <Skeleton className="h-12 w-1/3" />
          <Skeleton className="h-[300px] w-full" />
          <div className="grid grid-cols-2 gap-6">
            <Skeleton className="h-[200px]" />
            <Skeleton className="h-[200px]" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!platform) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-[50vh]">
          <h2 className="text-2xl font-bold">Platform Not Found</h2>
          <Link href="/platforms" className="text-primary hover:underline mt-4">Return to Platforms</Link>
        </div>
      </Layout>
    );
  }

  // Prepare chart data (combine valuations with dates)
  const chartData = [...(valuations || [])]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(v => ({
      date: format(new Date(v.date), 'MMM dd'),
      value: Number(v.value),
      originalDate: v.date // for tooltip
    }));

  return (
    <Layout>
      <div className="space-y-8">
        
        {/* Header */}
        <div>
          <Link href="/platforms" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-4 transition-colors">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Platforms
          </Link>
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg" style={{ backgroundColor: platform.color }}>
                 {platform.name.charAt(0)}
               </div>
               <div>
                 <h1 className="text-3xl font-bold font-display tracking-tight">{platform.name}</h1>
                 <p className="text-muted-foreground">{platform.category} • {platform.description}</p>
               </div>
            </div>
            
            <div className="flex gap-2">
              <AddTransactionDialog platformId={id} type="investment" />
              <AddTransactionDialog platformId={id} type="valuation" />
            </div>
          </div>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="bg-gradient-to-br from-card to-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Current Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold font-display">
                ${Number(platform.currentValue || 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-card to-muted/50">
             <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Invested</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold font-display text-muted-foreground">
                ${Number(platform.totalInvested || 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="chart" className="space-y-6">
          <TabsList>
            <TabsTrigger value="chart" className="gap-2"><TrendingUp className="h-4 w-4" /> Performance</TabsTrigger>
            <TabsTrigger value="investments" className="gap-2"><DollarSign className="h-4 w-4" /> Investment History</TabsTrigger>
            <TabsTrigger value="valuations" className="gap-2"><History className="h-4 w-4" /> Valuation History</TabsTrigger>
          </TabsList>

          <TabsContent value="chart" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Card>
              <CardHeader>
                <CardTitle>Value Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[400px] w-full">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={platform.color} stopOpacity={0.3}/>
                            <stop offset="95%" stopColor={platform.color} stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis 
                          dataKey="date" 
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
                          tickFormatter={(value) => `$${value.toLocaleString()}`}
                        />
                        <Tooltip 
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                          formatter={(value: number) => [`$${value.toLocaleString()}`, "Value"]}
                          labelFormatter={(label) => label}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="value" 
                          stroke={platform.color} 
                          strokeWidth={3}
                          fillOpacity={1} 
                          fill="url(#colorValue)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground">
                      No valuation history available. Add a valuation to see the chart.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="investments">
            <Card>
              <CardContent className="p-0">
                <div className="rounded-md border">
                  <div className="grid grid-cols-4 p-4 bg-muted/50 font-medium text-sm">
                    <div>Date</div>
                    <div>Amount</div>
                    <div>Notes</div>
                    <div className="text-right">Actions</div>
                  </div>
                  <div className="divide-y">
                    {investments?.length === 0 ? (
                       <div className="p-8 text-center text-muted-foreground">No investments recorded yet.</div>
                    ) : (
                      investments?.map((inv) => (
                        <div key={inv.id} className="grid grid-cols-4 p-4 text-sm hover:bg-muted/30 transition-colors items-center">
                          <div className="text-muted-foreground">{format(new Date(inv.date), 'MMM dd, yyyy')}</div>
                          <div className="font-medium">${Number(inv.amount).toLocaleString()}</div>
                          <div className="text-muted-foreground truncate">{inv.notes || "-"}</div>
                          <div className="flex justify-end">
                            <AddTransactionDialog 
                              platformId={id} 
                              type="investment" 
                              mode="edit" 
                              initialData={{
                                ...inv,
                                date: new Date(inv.date).toISOString().split('T')[0]
                              }} 
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="valuations">
             <Card>
              <CardContent className="p-0">
                <div className="rounded-md border">
                  <div className="grid grid-cols-3 p-4 bg-muted/50 font-medium text-sm">
                    <div>Date</div>
                    <div>Recorded Value</div>
                    <div className="text-right">Actions</div>
                  </div>
                  <div className="divide-y">
                     {valuations?.length === 0 ? (
                       <div className="p-8 text-center text-muted-foreground">No valuations recorded yet.</div>
                    ) : (
                      valuations?.map((v) => (
                        <div key={v.id} className="grid grid-cols-3 p-4 text-sm hover:bg-muted/30 transition-colors items-center">
                          <div className="text-muted-foreground">{format(new Date(v.date), 'MMM dd, yyyy')}</div>
                          <div className="font-medium">${Number(v.value).toLocaleString()}</div>
                          <div className="flex justify-end">
                            <AddTransactionDialog 
                              platformId={id} 
                              type="valuation" 
                              mode="edit" 
                              initialData={{
                                ...v,
                                date: new Date(v.date).toISOString().split('T')[0]
                              }} 
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
