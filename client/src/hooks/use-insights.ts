import { useMutation } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useGenerateInsight() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (prompt?: string) => {
      const res = await fetch(api.insights.generate.path, {
        method: api.insights.generate.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        credentials: "include",
      });
      
      if (!res.ok) {
        throw new Error("Failed to generate insights");
      }
      return api.insights.generate.responses[200].parse(await res.json());
    },
    onError: (error) => {
      toast({
        title: "Insight Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
