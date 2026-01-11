import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { TrendingUp } from "lucide-react";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ email: "", password: "", name: "" });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await apiRequest("POST", "/api/auth/login", loginForm);
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      
      toast({ title: "Welcome back!", description: "You have been logged in successfully." });
      setLocation("/");
    } catch (err: any) {
      toast({ 
        title: "Login failed", 
        description: err.message || "Invalid email or password",
        variant: "destructive" 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await apiRequest("POST", "/api/auth/register", registerForm);
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      
      toast({ title: "Account created!", description: "You have been registered and logged in." });
      setLocation("/");
    } catch (err: any) {
      toast({ 
        title: "Registration failed", 
        description: err.message || "Could not create account",
        variant: "destructive" 
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <TrendingUp className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold">InvestTrack</span>
          </div>
          <CardTitle>Welcome</CardTitle>
          <CardDescription>Sign in to your account or create a new one</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login" data-testid="tab-login">Sign In</TabsTrigger>
              <TabsTrigger value="register" data-testid="tab-register">Sign Up</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input 
                    id="login-email"
                    type="email" 
                    placeholder="you@example.com"
                    value={loginForm.email}
                    onChange={(e) => setLoginForm(prev => ({ ...prev, email: e.target.value }))}
                    required
                    data-testid="input-login-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <Input 
                    id="login-password"
                    type="password" 
                    placeholder="Enter your password"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
                    required
                    data-testid="input-login-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-login">
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="register-name">Name (optional)</Label>
                  <Input 
                    id="register-name"
                    type="text" 
                    placeholder="Your name"
                    value={registerForm.name}
                    onChange={(e) => setRegisterForm(prev => ({ ...prev, name: e.target.value }))}
                    data-testid="input-register-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-email">Email</Label>
                  <Input 
                    id="register-email"
                    type="email" 
                    placeholder="you@example.com"
                    value={registerForm.email}
                    onChange={(e) => setRegisterForm(prev => ({ ...prev, email: e.target.value }))}
                    required
                    data-testid="input-register-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-password">Password</Label>
                  <Input 
                    id="register-password"
                    type="password" 
                    placeholder="At least 8 characters"
                    value={registerForm.password}
                    onChange={(e) => setRegisterForm(prev => ({ ...prev, password: e.target.value }))}
                    required
                    minLength={8}
                    data-testid="input-register-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-register">
                  {isLoading ? "Creating account..." : "Create Account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
