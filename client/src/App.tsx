import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Platforms from "@/pages/Platforms";
import PlatformDetails from "@/pages/PlatformDetails";
import Analytics from "@/pages/Analytics";
import Landing from "@/pages/Landing";
import { useLocation } from "wouter";
import { useEffect } from "react";

function ProtectedRoute({ component: Component, ...rest }: { component: React.ComponentType<any>, [key: string]: any }) {
  const [location, setLocation] = useLocation();
  const isAuthenticated = sessionStorage.getItem("app_authenticated") === "true";

  useEffect(() => {
    if (!isAuthenticated && location !== "/landing") {
      setLocation("/landing");
    }
  }, [isAuthenticated, location, setLocation]);

  if (!isAuthenticated) return null;
  return <Component {...rest} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/landing" component={Landing} />
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
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
