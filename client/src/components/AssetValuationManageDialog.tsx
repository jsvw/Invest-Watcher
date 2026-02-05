import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { Loader2, Plus, Pencil, Trash2, TrendingUp } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AssetValuationManageDialogProps {
  assetId: number;
  assetName: string;
  currency: string;
  children: React.ReactNode;
}

interface AssetValuation {
  id: number;
  assetId: number;
  value: string;
  date: string;
  notes: string | null;
}

export function AssetValuationManageDialog({ assetId, assetName, currency, children }: AssetValuationManageDialogProps) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({ value: "", date: "", notes: "" });
  const { toast } = useToast();

  const currencySymbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : "";

  const { data: valuations, isLoading } = useQuery({
    queryKey: ['/api/assets', assetId, 'valuations'],
    queryFn: async () => {
      const res = await fetch(`/api/assets/${assetId}/valuations`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch valuations");
      return await res.json() as AssetValuation[];
    },
    enabled: open,
  });

  const addValuation = useMutation({
    mutationFn: async (data: { value: string; date: string; notes?: string }) => {
      return apiRequest("POST", `/api/asset-valuations`, { ...data, assetId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assets', assetId, 'valuations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/assets'] });
      setShowAddForm(false);
      setFormData({ value: "", date: "", notes: "" });
      toast({ title: "Valuation added" });
    },
    onError: () => {
      toast({ title: "Failed to add valuation", variant: "destructive" });
    },
  });

  const updateValuation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { value: string; date: string; notes?: string } }) => {
      return apiRequest("PATCH", `/api/asset-valuations/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assets', assetId, 'valuations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/assets'] });
      setEditingId(null);
      setFormData({ value: "", date: "", notes: "" });
      toast({ title: "Valuation updated" });
    },
    onError: () => {
      toast({ title: "Failed to update valuation", variant: "destructive" });
    },
  });

  const deleteValuation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/asset-valuations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assets', assetId, 'valuations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/assets'] });
      toast({ title: "Valuation deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete valuation", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!formData.value || !formData.date) return;
    
    const data = {
      value: formData.value,
      date: formData.date,
      notes: formData.notes || undefined,
    };

    if (editingId) {
      updateValuation.mutate({ id: editingId, data });
    } else {
      addValuation.mutate(data);
    }
  };

  const startEdit = (v: AssetValuation) => {
    setEditingId(v.id);
    setFormData({
      value: v.value,
      date: new Date(v.date).toISOString().split('T')[0],
      notes: v.notes || "",
    });
    setShowAddForm(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setShowAddForm(false);
    setFormData({ value: "", date: "", notes: "" });
  };

  const sortedValuations = valuations?.sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  ) || [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            {assetName} - Valuations
          </DialogTitle>
          <DialogDescription>
            View and manage valuation history for this asset
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {!showAddForm && !editingId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowAddForm(true);
                setFormData({ 
                  value: "", 
                  date: new Date().toISOString().split('T')[0], 
                  notes: "" 
                });
              }}
              className="w-full"
              data-testid="button-add-asset-valuation"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Valuation
            </Button>
          )}

          {(showAddForm || editingId) && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <div className="text-sm font-medium">
                {editingId ? "Edit Valuation" : "New Valuation"}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Date</Label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    data-testid="input-asset-valuation-date"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Value ({currency})</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    placeholder="0.00"
                    data-testid="input-asset-valuation-value"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notes (optional)</Label>
                <Input
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Optional notes"
                  data-testid="input-asset-valuation-notes"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={cancelEdit}>
                  Cancel
                </Button>
                <Button 
                  size="sm" 
                  onClick={handleSubmit}
                  disabled={!formData.value || !formData.date || addValuation.isPending || updateValuation.isPending}
                  data-testid="button-save-asset-valuation"
                >
                  {(addValuation.isPending || updateValuation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {editingId ? "Update" : "Save"}
                </Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sortedValuations.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No valuations recorded yet
            </div>
          ) : (
            <div className="border rounded-lg divide-y">
              {sortedValuations.map((v) => (
                <div 
                  key={v.id} 
                  className="flex items-center justify-between p-3 hover:bg-muted/30 transition-colors"
                  data-testid={`row-asset-valuation-${v.id}`}
                >
                  <div className="flex-1">
                    <div className="font-medium">
                      {currencySymbol}{Number(v.value).toLocaleString()} {!currencySymbol && currency}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(v.date), 'MMM dd, yyyy')}
                      {v.notes && ` • ${v.notes}`}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => startEdit(v)}
                      data-testid={`button-edit-asset-valuation-${v.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm("Delete this valuation?")) {
                          deleteValuation.mutate(v.id);
                        }
                      }}
                      disabled={deleteValuation.isPending}
                      data-testid={`button-delete-asset-valuation-${v.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
