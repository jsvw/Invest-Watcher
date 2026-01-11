import { Layout } from "@/components/Layout";
import { AddTransactionDialog } from "@/components/AddTransactionDialog";
import { usePlatform, usePlatforms } from "@/hooks/use-platforms";
import { useInvestments } from "@/hooks/use-investments";
import { useValuations } from "@/hooks/use-valuations";
import { useRoute } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, TrendingUp, History, DollarSign } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, Legend } from "recharts";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function PlatformDetails() {
  const [, params] = useRoute("/platforms/:id");
  const id = Number(params?.id);
  const [range, setRange] = useState("year");
  const [specificYear, setSpecificYear] = useState<string | null>(null);
  const [specificMonth, setSpecificMonth] = useState<string | null>(null);
  
  const { data: platforms } = usePlatforms();
  const { data: platform, isLoading: isPlatformLoading } = usePlatform(id);
  const { data: investments, isLoading: isInvestmentsLoading } = useInvestments(id);
  const { data: valuations, isLoading: isValuationsLoading } = useValuations(id);

  const { data: history, isLoading: isHistoryLoading } = useQuery({
    queryKey: [api.portfolio.history.path, id, range, specificYear, specificMonth],
    queryFn: async () => {
      let url = `${api.portfolio.history.path}?range=${range}&platformId=${id}`;
      if (specificYear) url += `&year=${specificYear}`;
      if (specificMonth) url += `&month_select=${specificMonth}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch history");
      return await res.json();
    }
  });

  const { data: availableFilters } = useQuery({
    queryKey: ['/api/portfolio/available-filters', id],
    queryFn: async () => {
      const res = await fetch(`/api/portfolio/available-filters?platformId=${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch filters");
      return await res.json();
    }
  });

  const years = availableFilters?.years || [];
  const monthsData = availableFilters?.months?.map((m: string) => {
    const [y, mm] = m.split('-');
    const monthName = new Date(parseInt(y), parseInt(mm) - 1).toLocaleString('default', { month: 'long' });
    return { value: mm, label: monthName, year: y };
  }) || [];

  const currentYear = years[0] || new Date().getFullYear().toString();

  // Stats calculation
  const statsData = history && history.length > 0 
    ? history[history.length - 1] 
    : { value: 0, invested: 0 };

  const platformTotalInvested = statsData.invested;
  const platformCurrentValue = statsData.value;

  if (isPlatformLoading || isInvestmentsLoading || isValuationsLoading || isHistoryLoading) {
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
                 <p className="text-muted-foreground">{platform.category} • {(platform as any).currency || "USD"} • {platform.description}</p>
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
                {((platform as any).currency || "USD") === "USD" ? "$" : ""}
                {platformCurrentValue.toLocaleString()}
                {((platform as any).currency || "USD") !== "USD" ? ` ${(platform as any).currency}` : ""}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-card to-muted/50">
             <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Invested</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold font-display text-muted-foreground">
                {((platform as any).currency || "USD") === "USD" ? "$" : ""}
                {platformTotalInvested.toLocaleString()}
                {((platform as any).currency || "USD") !== "USD" ? ` ${(platform as any).currency}` : ""}
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
              <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle>Platform Performance</CardTitle>
                  <CardDescription>Invested vs. Valuation over time</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(range === "year" || range.startsWith("year-")) && (
                    <Select value={specificYear || (range.startsWith("year-") ? range.split("-")[1] : "")} onValueChange={(val) => {
                      setRange(`year-${val}`);
                      setSpecificYear(val);
                    }}>
                      <SelectTrigger className="w-[100px] h-9">
                        <SelectValue placeholder="Year" />
                      </SelectTrigger>
                      <SelectContent>
                        {years.map((y: string) => (
                          <SelectItem key={y} value={y}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {(range === "month" || range.startsWith("month-")) && (
                    <div className="flex gap-2">
                      <Select value={specificYear || (range.startsWith("month-") ? range.split("-")[1] : currentYear)} onValueChange={(val) => setSpecificYear(val)}>
                        <SelectTrigger className="w-[100px] h-9">
                          <SelectValue placeholder="Year" />
                        </SelectTrigger>
                        <SelectContent>
                          {years.map((y: string) => (
                            <SelectItem key={y} value={y}>{y}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={specificMonth || (range.startsWith("month-") ? range.split("-")[2] : "")} onValueChange={(val) => {
                        const year = specificYear || (range.startsWith("month-") ? range.split("-")[1] : currentYear);
                        setRange(`month-${year}-${val}`);
                        setSpecificMonth(val);
                      }}>
                        <SelectTrigger className="w-[120px] h-9">
                          <SelectValue placeholder="Month" />
                        </SelectTrigger>
                        <SelectContent>
                          {monthsData.filter((m: any) => m.year === (specificYear || (range.startsWith("month-") ? range.split("-")[1] : currentYear))).map((m: any) => (
                            <SelectItem key={`${m.year}-${m.value}`} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Tabs value={range.startsWith("year-") ? "year" : range.startsWith("month-") ? "month" : range} onValueChange={(val) => {
                    setRange(val);
                    setSpecificYear(null);
                    setSpecificMonth(null);
                  }} className="w-auto">
                    <TabsList>
                      <TabsTrigger value="7d">7D</TabsTrigger>
                      <TabsTrigger value="month">1M</TabsTrigger>
                      <TabsTrigger value="quarter">3M</TabsTrigger>
                      <TabsTrigger value="year">1Y</TabsTrigger>
                      <TabsTrigger value="all">ALL</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-[400px] w-full">
                  {history && history.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={history}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis 
                          dataKey="date" 
                          stroke="hsl(var(--muted-foreground))" 
                          fontSize={12} 
                          tickLine={false} 
                          axisLine={false} 
                          tickFormatter={(date) => format(new Date(date), 'MMM yy')}
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
                          formatter={(value: number) => [`$${value.toLocaleString()}`, ""]}
                          labelFormatter={(label) => format(new Date(label), 'MMM dd, yyyy')}
                        />
                        <Legend verticalAlign="top" height={36}/>
                        <Line 
                          type="monotone" 
                          dataKey="value" 
                          name="Current Value"
                          stroke={platform.color} 
                          strokeWidth={3}
                          dot={false}
                          activeDot={{ r: 6 }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="invested" 
                          name="Total Invested"
                          stroke="#8884d8" 
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground">
                      No performance history available.
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
