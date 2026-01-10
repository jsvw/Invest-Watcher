import { Layout } from "@/components/Layout";
import { StatCard } from "@/components/StatCard";
import { usePlatforms } from "@/hooks/use-platforms";
import { useGenerateInsight } from "@/hooks/use-insights";
import { Wallet, TrendingUp, DollarSign, BrainCircuit, RefreshCcw } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const { data: platforms, isLoading } = usePlatforms();
  const { mutate: generateInsight, data: insightData, isPending: isInsightLoading } = useGenerateInsight();

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
          <Skeleton className="h-[400px] rounded-xl" />
        </div>
      </Layout>
    );
  }

  // Calculate Aggregates
  const totalValue = platforms?.reduce((acc, p) => acc + (Number(p.currentValue) || 0), 0) || 0;
  const totalInvested = platforms?.reduce((acc, p) => acc + (Number(p.totalInvested) || 0), 0) || 0;
  const netProfit = totalValue - totalInvested;
  const roi = totalInvested > 0 ? (netProfit / totalInvested) * 100 : 0;

  // Prepare Chart Data
  const pieData = platforms?.reduce((acc: any[], platform) => {
    const existing = acc.find(item => item.name === platform.category);
    if (existing) {
      existing.value += Number(platform.currentValue) || 0;
    } else {
      acc.push({ name: platform.category, value: Number(platform.currentValue) || 0 });
    }
    return acc;
  }, []) || [];

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <Layout>
      <div className="space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">Dashboard</h1>
            <p className="text-muted-foreground">Your financial overview at a glance.</p>
          </div>
          <Button 
            onClick={() => generateInsight("Analyze my portfolio allocation and performance.")}
            className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white border-0 shadow-lg shadow-indigo-500/25"
            disabled={isInsightLoading}
          >
            {isInsightLoading ? <RefreshCcw className="h-4 w-4 animate-spin mr-2" /> : <BrainCircuit className="h-4 w-4 mr-2" />}
            {isInsightLoading ? "Analyzing..." : "Get AI Insights"}
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard 
            title="Total Portfolio Value" 
            value={`$${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} 
            icon={Wallet} 
            className="border-l-primary"
          />
          <StatCard 
            title="Total Invested" 
            value={`$${totalInvested.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} 
            icon={DollarSign}
            className="border-l-secondary"
          />
          <StatCard 
            title="Net Profit / Loss" 
            value={`$${Math.abs(netProfit).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} 
            trend={netProfit >= 0 ? "up" : "down"}
            trendValue={`${roi.toFixed(2)}%`}
            icon={TrendingUp}
            className={netProfit >= 0 ? "border-l-emerald-500" : "border-l-rose-500"}
          />
        </div>

        {/* AI Insight Section */}
        {(insightData || isInsightLoading) && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-900/20 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-900/50"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-indigo-100 dark:bg-indigo-900 rounded-xl">
                <BrainCircuit className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="space-y-2 flex-1">
                <h3 className="text-lg font-semibold text-indigo-900 dark:text-indigo-100">AI Portfolio Analysis</h3>
                {isInsightLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full bg-indigo-200/50 dark:bg-indigo-800/50" />
                    <Skeleton className="h-4 w-3/4 bg-indigo-200/50 dark:bg-indigo-800/50" />
                  </div>
                ) : (
                  <div className="prose prose-sm text-indigo-800 dark:text-indigo-200 max-w-none">
                     {/* Safe render of markdown/text content */}
                     {insightData?.insight.split('\n').map((line, i) => <p key={i}>{line}</p>)}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Allocation Chart */}
          <Card className="lg:col-span-1 shadow-md">
            <CardHeader>
              <CardTitle>Asset Allocation</CardTitle>
              <CardDescription>Distribution by category</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => `$${value.toLocaleString()}`}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-4 justify-center mt-4">
                {pieData.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="text-muted-foreground">{entry.name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Platforms List Preview */}
          <Card className="lg:col-span-2 shadow-md">
            <CardHeader>
              <CardTitle>Platform Performance</CardTitle>
              <CardDescription>Current value by platform</CardDescription>
            </CardHeader>
            <CardContent>
               {platforms && platforms.length > 0 ? (
                 <div className="space-y-4">
                   {platforms.map(platform => {
                     const val = Number(platform.currentValue) || 0;
                     const invested = Number(platform.totalInvested) || 0;
                     const gain = val - invested;
                     const percent = invested > 0 ? (gain / invested) * 100 : 0;
                     
                     return (
                       <div key={platform.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors">
                         <div className="flex items-center gap-4">
                           <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: platform.color }}>
                             {platform.name.charAt(0)}
                           </div>
                           <div>
                             <h4 className="font-semibold">{platform.name}</h4>
                             <p className="text-xs text-muted-foreground">{platform.category}</p>
                           </div>
                         </div>
                         <div className="text-right">
                           <div className="font-bold">${val.toLocaleString()}</div>
                           <div className={cn("text-xs font-medium", gain >= 0 ? "text-emerald-600" : "text-rose-600")}>
                             {gain >= 0 ? "+" : ""}{percent.toFixed(2)}%
                           </div>
                         </div>
                       </div>
                     )
                   })}
                 </div>
               ) : (
                 <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                   No platforms added yet.
                 </div>
               )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
