import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/AuthPage";
import { lazy, Suspense, useEffect, createContext, useContext } from "react";
import { Loader2 } from "lucide-react";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const PlatformDetails = lazy(() => import("@/pages/PlatformDetails"));
const Settings = lazy(() => import("@/pages/Settings"));
const Imports = lazy(() => import("@/pages/Imports"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

interface User {
  id: number;
  email: string;
  name: string | null;
  currency: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  refetch: () => void;
  refetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  isLoading: true, 
  refetch: () => {},
  refetchUser: async () => {},
});

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

  const refetchUser = async () => {
    await refetch();
  };

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, refetch, refetchUser }}>
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
  return (
    <Suspense fallback={<PageLoader />}>
      <Component {...rest} />
    </Suspense>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={AuthPage} />
      <Route path="/">
        {(params) => <ProtectedRoute component={Dashboard} {...params} />}
      </Route>
      <Route path="/platforms/:slug">
        {(params) => <ProtectedRoute component={PlatformDetails} {...params} />}
      </Route>
      <Route path="/settings">
        {(params) => <ProtectedRoute component={Settings} {...params} />}
      </Route>
      <Route path="/imports">
        {(params) => <ProtectedRoute component={Imports} {...params} />}
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
