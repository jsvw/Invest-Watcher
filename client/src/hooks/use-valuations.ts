import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type InsertValuation } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useValuations(platformId: number) {
  return useQuery({
    queryKey: [api.valuations.list.path, platformId],
    enabled: !!platformId,
    queryFn: async () => {
      const url = buildUrl(api.valuations.list.path, { platformId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch valuations");
      return api.valuations.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateValuation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertValuation) => {
      const res = await fetch(api.valuations.create.path, {
        method: api.valuations.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 400) {
          const error = api.valuations.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to update valuation");
      }
      return api.valuations.create.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.valuations.list.path, variables.platformId] });
      queryClient.invalidateQueries({ queryKey: [api.platforms.list.path] }); // Refresh totals
      toast({
        title: "Success",
        description: "Valuation updated successfully",
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

export function useUpdateValuation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<InsertValuation> & { id: number }) => {
      const res = await fetch(api.valuations.update.path.replace(':id', String(id)), {
        method: api.valuations.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 400) {
          const error = api.valuations.update.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to update valuation");
      }
      return api.valuations.update.responses[200].parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.valuations.list.path, data.platformId] });
      queryClient.invalidateQueries({ queryKey: [api.platforms.list.path] }); // Refresh totals
      toast({
        title: "Success",
        description: "Valuation updated successfully",
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
