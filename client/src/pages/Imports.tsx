import { useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Mail, Calendar, DollarSign, ArrowLeft, Check, X, Building2, Package } from "lucide-react";
import type { Platform, Asset, EmailImport } from "@shared/schema";
import { format } from "date-fns";

const TRANSACTION_TYPES = [
  { value: "deposit", label: "Deposit", color: "bg-green-500" },
  { value: "withdrawal", label: "Withdrawal", color: "bg-red-500" },
  { value: "purchase", label: "Asset Purchase", color: "bg-blue-500" },
  { value: "partial_exit", label: "Partial Exit", color: "bg-amber-500" },
  { value: "full_exit", label: "Full Exit", color: "bg-purple-500" },
  { value: "interest", label: "Interest/Dividend", color: "bg-emerald-500" },
];

export default function Imports() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedImport, setSelectedImport] = useState<EmailImport | null>(null);
  const [editedData, setEditedData] = useState<Partial<EmailImport>>({});
  const [isApproving, setIsApproving] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  const { data: imports, isLoading, refetch } = useQuery<EmailImport[]>({
    queryKey: ["/api/email-imports"],
  });

  const { data: platforms } = useQuery<Platform[]>({
    queryKey: ["/api/platforms"],
  });

  const { data: allAssets } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
    enabled: false,
  });

  const handleSelectImport = (imp: EmailImport) => {
    setSelectedImport(imp);
    setEditedData({
      transactionType: imp.transactionType,
      parsedAmount: imp.parsedAmount,
      parsedDate: imp.parsedDate,
      matchedPlatformId: imp.matchedPlatformId,
      matchedAssetId: imp.matchedAssetId,
      parsedNotes: imp.parsedNotes,
    });
  };

  const handleApprove = async () => {
    if (!selectedImport) return;
    
    setIsApproving(true);
    try {
      await apiRequest("PATCH", `/api/email-imports/${selectedImport.id}`, editedData);
      await apiRequest("POST", `/api/email-imports/${selectedImport.id}/approve`);
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/platforms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/investments"] });
      toast({
        title: "Import approved",
        description: "Transaction has been added to your portfolio.",
      });
      setSelectedImport(null);
      setEditedData({});
    } catch (error: any) {
      toast({
        title: "Failed to approve",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsApproving(false);
    }
  };

  const handleDismiss = async () => {
    if (!selectedImport) return;
    
    setIsDismissing(true);
    try {
      await apiRequest("POST", `/api/email-imports/${selectedImport.id}/dismiss`);
      await refetch();
      toast({
        title: "Import dismissed",
        description: "Email has been removed from the import queue.",
      });
      setSelectedImport(null);
      setEditedData({});
    } catch (error: any) {
      toast({
        title: "Failed to dismiss",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDismissing(false);
    }
  };

  const getTypeInfo = (type: string | null) => {
    return TRANSACTION_TYPES.find(t => t.value === type) || TRANSACTION_TYPES[0];
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/settings")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Email Imports</h1>
            <p className="text-muted-foreground">Review and approve pending investment imports</p>
          </div>
        </div>

        {(!imports || imports.length === 0) ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No pending imports</h3>
              <p className="text-muted-foreground mb-4">
                New investment emails will appear here after you check your inbox.
              </p>
              <Button variant="outline" onClick={() => setLocation("/settings")}>
                Go to Settings
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Pending ({imports.length})</h2>
              {imports.map((imp) => {
                const typeInfo = getTypeInfo(imp.transactionType);
                return (
                  <Card 
                    key={imp.id} 
                    className={`cursor-pointer transition-all ${selectedImport?.id === imp.id ? 'ring-2 ring-primary' : 'hover:bg-muted/50'}`}
                    onClick={() => handleSelectImport(imp)}
                    data-testid={`card-import-${imp.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{imp.emailSubject || "No subject"}</p>
                          <p className="text-sm text-muted-foreground truncate">{imp.emailFrom}</p>
                          {imp.emailDate && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(new Date(imp.emailDate), "MMM d, yyyy")}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="secondary" className={`${typeInfo.color} text-white text-xs`}>
                            {typeInfo.label}
                          </Badge>
                          {imp.parsedAmount && (
                            <span className="text-sm font-medium">
                              €{Number(imp.parsedAmount).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {selectedImport && (
              <Card className="lg:sticky lg:top-6 h-fit">
                <CardHeader>
                  <CardTitle className="text-lg">Review Import</CardTitle>
                  <CardDescription className="truncate">{selectedImport.emailSubject}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Transaction Type</Label>
                    <Select
                      value={editedData.transactionType || "deposit"}
                      onValueChange={(v) => setEditedData({...editedData, transactionType: v})}
                    >
                      <SelectTrigger data-testid="select-transaction-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TRANSACTION_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Platform
                    </Label>
                    <Select
                      value={editedData.matchedPlatformId?.toString() || ""}
                      onValueChange={(v) => setEditedData({...editedData, matchedPlatformId: Number(v)})}
                    >
                      <SelectTrigger data-testid="select-platform">
                        <SelectValue placeholder="Select platform" />
                      </SelectTrigger>
                      <SelectContent>
                        {platforms?.map((platform) => (
                          <SelectItem key={platform.id} value={platform.id.toString()}>
                            {platform.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedImport.parsedPlatformName && (
                      <p className="text-xs text-muted-foreground">
                        AI detected: {selectedImport.parsedPlatformName}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Amount
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editedData.parsedAmount?.toString() || ""}
                      onChange={(e) => setEditedData({...editedData, parsedAmount: e.target.value})}
                      data-testid="input-amount"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Date
                    </Label>
                    <Input
                      type="date"
                      value={editedData.parsedDate ? format(new Date(editedData.parsedDate), "yyyy-MM-dd") : ""}
                      onChange={(e) => setEditedData({...editedData, parsedDate: new Date(e.target.value)})}
                      data-testid="input-date"
                    />
                  </div>

                  {(editedData.transactionType === "purchase" || 
                    editedData.transactionType === "partial_exit" || 
                    editedData.transactionType === "full_exit") && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Asset Name
                      </Label>
                      <Input
                        value={selectedImport.parsedAssetName || ""}
                        placeholder="Asset name (optional)"
                        disabled
                        className="bg-muted"
                        data-testid="input-asset-name"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Input
                      value={editedData.parsedNotes || ""}
                      onChange={(e) => setEditedData({...editedData, parsedNotes: e.target.value})}
                      placeholder="Optional notes"
                      data-testid="input-notes"
                    />
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button
                      onClick={handleApprove}
                      disabled={isApproving || !editedData.matchedPlatformId}
                      className="flex-1"
                      data-testid="button-approve-import"
                    >
                      {isApproving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleDismiss}
                      disabled={isDismissing}
                      data-testid="button-dismiss-import"
                    >
                      {isDismissing ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <X className="mr-2 h-4 w-4" />
                      )}
                      Dismiss
                    </Button>
                  </div>

                  {selectedImport.emailBody && (
                    <div className="pt-4 border-t">
                      <Label className="text-xs text-muted-foreground">Email Preview</Label>
                      <div className="mt-2 p-3 bg-muted rounded-lg max-h-48 overflow-auto">
                        <pre className="text-xs whitespace-pre-wrap font-mono">
                          {selectedImport.emailBody.substring(0, 1000)}
                          {selectedImport.emailBody.length > 1000 && "..."}
                        </pre>
                      </div>
                    </div>
                  )}
                  
                  {selectedImport.attachmentContent && (
                    <div className="pt-4 border-t">
                      <Label className="text-xs text-muted-foreground">Attachment Content (Parsed)</Label>
                      <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg max-h-48 overflow-auto border border-blue-200 dark:border-blue-800">
                        <pre className="text-xs whitespace-pre-wrap font-mono">
                          {selectedImport.attachmentContent.substring(0, 2000)}
                          {selectedImport.attachmentContent.length > 2000 && "..."}
                        </pre>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
