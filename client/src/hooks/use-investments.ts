import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type InsertInvestment } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

export function useInvestments(platformId: number) {
  return useQuery({
    queryKey: [api.investments.list.path, platformId],
    enabled: !!platformId,
    queryFn: async () => {
      const url = buildUrl(api.investments.list.path, { platformId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch investments");
      // Note: investments response contains "amount" which might be string from numeric
      // We rely on Zod coerce in schema or handle strings in UI
      const data = await res.json();
      return api.investments.list.responses[200].parse(data);
    },
  });
}

export function useCreateInvestment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertInvestment) => {
      // Coerce numeric strings if necessary handled by schema
      const res = await fetch(api.investments.create.path, {
        method: api.investments.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 400) {
          const error = api.investments.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to add investment");
      }
      return api.investments.create.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.investments.list.path, variables.platformId] });
      queryClient.invalidateQueries({ queryKey: [api.platforms.list.path] }); // Refresh totals
      toast({
        title: "Success",
        description: "Investment recorded successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
