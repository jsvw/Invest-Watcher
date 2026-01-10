import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type InsertPlatform } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function usePlatforms() {
  return useQuery({
    queryKey: [api.platforms.list.path],
    queryFn: async () => {
      const res = await fetch(api.platforms.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch platforms");
      return api.platforms.list.responses[200].parse(await res.json());
    },
  });
}

export function usePlatform(id: number) {
  return useQuery({
    queryKey: [api.platforms.get.path, id],
    enabled: !!id,
    queryFn: async () => {
      const url = buildUrl(api.platforms.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch platform");
      return api.platforms.get.responses[200].parse(await res.json());
    },
  });
}

export function useCreatePlatform() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertPlatform) => {
      const res = await fetch(api.platforms.create.path, {
        method: api.platforms.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 400) {
          const error = api.platforms.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to create platform");
      }
      return api.platforms.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.platforms.list.path] });
      toast({
        title: "Success",
        description: "Platform added successfully",
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
