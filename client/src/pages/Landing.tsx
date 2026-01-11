import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Lock } from "lucide-react";

export default function Landing() {
  const [, setLocation] = useLocation();
  const [word, setWord] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    const isAuth = sessionStorage.getItem("app_authenticated");
    if (isAuth === "true") {
      setLocation("/");
    }
  }, [setLocation]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // The secret word is "invest" (case-insensitive)
    if (word.toLowerCase() === "invest") {
      sessionStorage.setItem("app_authenticated", "true");
      setLocation("/");
    } else {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4 overflow-hidden relative">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5 pointer-events-none" />
      
      <Card className="w-full max-w-md shadow-2xl border-primary/20 bg-card/50 backdrop-blur-sm relative z-10 animate-in fade-in zoom-in duration-500">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-3xl font-bold font-display tracking-tight text-foreground">
            InvestTrack
          </CardTitle>
          <CardDescription className="text-muted-foreground text-base">
            Please enter the secret word to access your portfolio.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Enter secret word..."
                value={word}
                onChange={(e) => setWord(e.target.value)}
                className={`h-12 text-center text-lg tracking-widest transition-all duration-300 ${
                  error ? "border-destructive ring-2 ring-destructive/20 animate-shake" : "border-primary/20 focus-visible:ring-primary/30"
                }`}
                autoFocus
              />
              {error && (
                <p className="text-sm text-destructive text-center font-medium animate-in fade-in slide-in-from-top-1">
                  Incorrect word. Please try again.
                </p>
              )}
            </div>
            <Button 
              type="submit" 
              className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-700 shadow-lg shadow-primary/20 transition-all active:scale-[0.98]"
            >
              Enter Application
            </Button>
          </form>
          <p className="mt-8 text-center text-xs text-muted-foreground uppercase tracking-widest">
            Secure Portfolio Tracking
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
