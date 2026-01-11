import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { AssetResponse, InsertAsset, InsertAssetValuation, AssetValuation } from "@shared/schema";

export function useAssets(platformId: number) {
  return useQuery<AssetResponse[]>({
    queryKey: ['/api/platforms', platformId, 'assets'],
    enabled: !!platformId && platformId > 0,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/platforms/${platformId}/assets`);
      if (!res.ok) throw new Error("Failed to fetch assets");
      return res.json();
    },
  });
}

export function useAsset(id: number) {
  return useQuery<AssetResponse>({
    queryKey: ['/api/assets', id],
    enabled: !!id && id > 0,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/assets/${id}`);
      if (!res.ok) throw new Error("Failed to fetch asset");
      return res.json();
    },
  });
}

export function useAssetValuations(assetId: number) {
  return useQuery<AssetValuation[]>({
    queryKey: ['/api/assets', assetId, 'valuations'],
    enabled: !!assetId && assetId > 0,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/assets/${assetId}/valuations`);
      if (!res.ok) throw new Error("Failed to fetch valuations");
      return res.json();
    },
  });
}

export function useCreateAsset(platformId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/assets", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platforms', platformId, 'assets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/platforms'] });
      toast({ title: "Success", description: "Asset added successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateAsset(platformId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/assets/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platforms', platformId, 'assets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/platforms'] });
      toast({ title: "Success", description: "Asset updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteAsset(platformId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/assets/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platforms', platformId, 'assets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/platforms'] });
      toast({ title: "Success", description: "Asset deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useExitAsset(platformId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, exitDate, exitPrice }: { id: number; exitDate: string; exitPrice: string }) => {
      const res = await apiRequest("POST", `/api/assets/${id}/exit`, { exitDate, exitPrice });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platforms', platformId, 'assets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/platforms'] });
      toast({ title: "Success", description: "Asset marked as exited" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useCreateAssetValuation(assetId: number, platformId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertAssetValuation) => {
      const res = await apiRequest("POST", "/api/asset-valuations", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assets', assetId, 'valuations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/platforms', platformId, 'assets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/platforms'] });
      toast({ title: "Success", description: "Valuation recorded" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}
