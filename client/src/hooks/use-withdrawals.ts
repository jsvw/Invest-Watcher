import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type InsertWithdrawal } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useWithdrawals(platformId: number) {
  return useQuery({
    queryKey: [api.withdrawals.list.path, platformId],
    enabled: !!platformId,
    queryFn: async () => {
      const url = buildUrl(api.withdrawals.list.path, { platformId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch withdrawals");
      const data = await res.json();
      return api.withdrawals.list.responses[200].parse(data);
    },
  });
}

export function useCreateWithdrawal() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertWithdrawal) => {
      const res = await fetch(api.withdrawals.create.path, {
        method: api.withdrawals.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 400) {
          const error = api.withdrawals.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to add withdrawal");
      }
      return api.withdrawals.create.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.withdrawals.list.path, variables.platformId] });
      queryClient.invalidateQueries({ queryKey: [api.platforms.list.path] });
      toast({
        title: "Success",
        description: "Withdrawal recorded successfully",
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

export function useUpdateWithdrawal() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<InsertWithdrawal> & { id: number }) => {
      const res = await fetch(api.withdrawals.update.path.replace(':id', String(id)), {
        method: api.withdrawals.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 400) {
          const error = api.withdrawals.update.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to update withdrawal");
      }
      return api.withdrawals.update.responses[200].parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.withdrawals.list.path, data.platformId] });
      queryClient.invalidateQueries({ queryKey: [api.platforms.list.path] });
      toast({
        title: "Success",
        description: "Withdrawal updated successfully",
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

export function useDeleteWithdrawal() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, platformId }: { id: number; platformId: number }) => {
      const res = await fetch(api.withdrawals.delete.path.replace(':id', String(id)), {
        method: api.withdrawals.delete.method,
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to delete withdrawal");
      }
      return { id, platformId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.withdrawals.list.path, data.platformId] });
      queryClient.invalidateQueries({ queryKey: [api.platforms.list.path] });
      toast({
        title: "Success",
        description: "Withdrawal deleted successfully",
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
