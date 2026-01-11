import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Platforms from "@/pages/Platforms";
import PlatformDetails from "@/pages/PlatformDetails";
import Analytics from "@/pages/Analytics";
import AuthPage from "@/pages/AuthPage";
import { useEffect, createContext, useContext } from "react";
import { Loader2 } from "lucide-react";

interface User {
  id: number;
  email: string;
  name: string | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  refetch: () => void;
}

const AuthContext = createContext<AuthContextType>({ user: null, isLoading: true, refetch: () => {} });

export function useAuth() {
  return useContext(AuthContext);
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, refetch } = useQuery<User | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, refetch }}>
      {children}
    </AuthContext.Provider>
  );
}

function ProtectedRoute({ component: Component, ...rest }: { component: React.ComponentType<any>, [key: string]: any }) {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [isLoading, user, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return null;
  return <Component {...rest} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={AuthPage} />
      <Route path="/">
        {(params) => <ProtectedRoute component={Dashboard} {...params} />}
      </Route>
      <Route path="/platforms">
        {(params) => <ProtectedRoute component={Platforms} {...params} />}
      </Route>
      <Route path="/platforms/:id">
        {(params) => <ProtectedRoute component={PlatformDetails} {...params} />}
      </Route>
      <Route path="/analytics">
        {(params) => <ProtectedRoute component={Analytics} {...params} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
