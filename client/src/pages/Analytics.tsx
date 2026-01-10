import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { usePlatforms } from "@/hooks/use-platforms";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

export default function Analytics() {
  const { data: platforms } = usePlatforms();

  const pieData = platforms?.reduce((acc: any[], platform) => {
    const existing = acc.find(item => item.name === platform.category);
    if (existing) {
      existing.value += Number(platform.currentValue) || 0;
    } else {
      acc.push({ name: platform.category, value: Number(platform.currentValue) || 0 });
    }
    return acc;
  }, []) || [];

  const performanceData = platforms?.map(p => ({
    name: p.name,
    invested: Number(p.totalInvested) || 0,
    current: Number(p.currentValue) || 0,
  })) || [];

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">Deep dive into your portfolio performance.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Allocation by Category</CardTitle>
              <CardDescription>Where your money is currently sitting</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={120}
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
              <div className="grid grid-cols-2 gap-4 mt-6">
                {pieData.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="text-sm font-medium">{entry.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto">${entry.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg">
             <CardHeader>
              <CardTitle>Invested vs Current Value</CardTitle>
              <CardDescription>Performance comparison by platform</CardDescription>
            </CardHeader>
            <CardContent>
               <div className="h-[400px]">
                 <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={performanceData} layout="vertical" margin={{ left: 20 }}>
                     <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                     <XAxis type="number" hide />
                     <YAxis 
                       dataKey="name" 
                       type="category" 
                       width={100} 
                       tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} 
                       axisLine={false} 
                       tickLine={false} 
                     />
                     <Tooltip 
                        formatter={(value: number) => `$${value.toLocaleString()}`}
                        cursor={{ fill: "hsl(var(--muted)/0.2)" }}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                     />
                     <Bar dataKey="invested" name="Invested" fill="#94a3b8" radius={[0, 4, 4, 0]} barSize={20} />
                     <Bar dataKey="current" name="Current Value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                   </BarChart>
                 </ResponsiveContainer>
               </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
