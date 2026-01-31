import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/App";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, Lock, User, Mail, Coins, Trash2, AlertTriangle, Inbox, RefreshCw, CheckCircle, ExternalLink } from "lucide-react";

interface EmailSettingsResponse {
  id: number;
  userId: number;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapTls: boolean;
  enabled: boolean;
  lastPollAt: string | null;
  hasPassword: boolean;
}

interface PollResult {
  success: boolean;
  count: number;
  error?: string;
}

const CURRENCIES = [
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
];

export default function Settings() {
  const [, setLocation] = useLocation();
  const { user, refetchUser } = useAuth();
  const { toast } = useToast();
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isUpdatingCurrency, setIsUpdatingCurrency] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // Email settings state
  const [emailAddress, setEmailAddress] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  // Fetch email settings
  const { data: emailSettings, refetch: refetchEmailSettings } = useQuery<EmailSettingsResponse | null>({
    queryKey: ["/api/email-settings"],
  });

  // Fetch pending imports count
  const { data: pendingImports } = useQuery<any[]>({
    queryKey: ["/api/email-imports"],
  });

  useEffect(() => {
    if (emailSettings) {
      setEmailAddress(emailSettings.imapUser || "");
      setEmailEnabled(emailSettings.enabled ?? true);
    }
  }, [emailSettings]);

  const handleSaveEmailSettings = async () => {
    if (!emailAddress) {
      toast({
        title: "Email required",
        description: "Please enter your Gmail address.",
        variant: "destructive",
      });
      return;
    }

    setIsSavingEmail(true);
    try {
      await apiRequest("POST", "/api/email-settings", {
        imapHost: "imap.gmail.com",
        imapPort: 993,
        imapUser: emailAddress,
        imapPassword: appPassword || undefined,
        imapTls: true,
        enabled: emailEnabled,
      });
      await refetchEmailSettings();
      setAppPassword("");
      toast({
        title: "Email settings saved",
        description: "Your email import settings have been updated.",
      });
    } catch (error: any) {
      toast({
        title: "Failed to save",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSavingEmail(false);
    }
  };

  const handlePollEmails = async () => {
    setIsPolling(true);
    try {
      const result = await apiRequest("POST", "/api/email-settings/poll") as unknown as PollResult;
      queryClient.invalidateQueries({ queryKey: ["/api/email-imports"] });
      if (result.success) {
        toast({
          title: "Emails checked",
          description: result.count > 0 
            ? `Found ${result.count} new investment email(s) to review.`
            : "No new investment emails found.",
        });
      } else {
        toast({
          title: "Check failed",
          description: result.error || "Could not connect to email server.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Check failed",
        description: error.message || "Please verify your email settings.",
        variant: "destructive",
      });
    } finally {
      setIsPolling(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== "DELETE") {
      toast({
        title: "Confirmation required",
        description: "Please type DELETE to confirm account deletion.",
        variant: "destructive",
      });
      return;
    }

    setIsDeletingAccount(true);
    try {
      await apiRequest("DELETE", "/api/auth/account");
      queryClient.clear();
      toast({
        title: "Account deleted",
        description: "Your account and all data have been permanently deleted.",
      });
      setLocation("/login");
    } catch (error: any) {
      toast({
        title: "Failed to delete account",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleCurrencyChange = async (newCurrency: string) => {
    setIsUpdatingCurrency(true);
    try {
      await apiRequest("POST", "/api/auth/update-currency", { currency: newCurrency });
      await refetchUser();
      queryClient.invalidateQueries({ queryKey: ["/api/platforms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Currency updated",
        description: `Your default currency is now ${newCurrency}.`,
      });
    } catch (error: any) {
      toast({
        title: "Failed to update currency",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingCurrency(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure your new passwords match.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 8) {
      toast({
        title: "Password too short",
        description: "New password must be at least 8 characters.",
        variant: "destructive",
      });
      return;
    }

    setIsChangingPassword(true);
    try {
      await apiRequest("POST", "/api/auth/change-password", {
        currentPassword,
        newPassword,
      });
      toast({
        title: "Password changed",
        description: "Your password has been updated successfully.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast({
        title: "Failed to change password",
        description: error.message || "Please check your current password and try again.",
        variant: "destructive",
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage your account settings</p>
        </div>

        <div className="grid gap-6 max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Account Information
              </CardTitle>
              <CardDescription>Your account details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  Email
                </Label>
                <Input 
                  value={user?.email || ""} 
                  disabled 
                  className="bg-muted"
                  data-testid="input-email-display"
                />
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input 
                  value={user?.name || "Not set"} 
                  disabled 
                  className="bg-muted"
                  data-testid="input-name-display"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Coins className="h-5 w-5" />
                Display Currency
              </CardTitle>
              <CardDescription>Choose your preferred currency for displaying values</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Default Currency</Label>
                <Select
                  value={user?.currency || "EUR"}
                  onValueChange={handleCurrencyChange}
                  disabled={isUpdatingCurrency}
                >
                  <SelectTrigger className="w-full" data-testid="select-currency">
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((currency) => (
                      <SelectItem key={currency.code} value={currency.code}>
                        {currency.symbol} - {currency.name} ({currency.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  This currency will be used as the default for displaying portfolio values.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Change Password
              </CardTitle>
              <CardDescription>Update your password to keep your account secure</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter your current password"
                    required
                    data-testid="input-current-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password (min. 8 characters)"
                    required
                    data-testid="input-new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your new password"
                    required
                    data-testid="input-confirm-password"
                  />
                </div>
                <Button 
                  type="submit" 
                  disabled={isChangingPassword}
                  data-testid="button-change-password"
                >
                  {isChangingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Change Password
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Inbox className="h-5 w-5" />
                Email Import
              </CardTitle>
              <CardDescription>
                Automatically import investments from your email inbox
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="emailAddress">Gmail Address</Label>
                <Input
                  id="emailAddress"
                  type="email"
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  placeholder="your.email@gmail.com"
                  data-testid="input-email-import-address"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="appPassword">
                  App Password {emailSettings?.hasPassword && <span className="text-green-600 text-xs">(saved)</span>}
                </Label>
                <Input
                  id="appPassword"
                  type="password"
                  value={appPassword}
                  onChange={(e) => setAppPassword(e.target.value)}
                  placeholder={emailSettings?.hasPassword ? "••••••••••••••••" : "Enter Gmail App Password"}
                  data-testid="input-email-app-password"
                />
                <p className="text-xs text-muted-foreground">
                  Create an App Password at{" "}
                  <a 
                    href="https://myaccount.google.com/apppasswords" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    myaccount.google.com <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="emailEnabled">Enable email import</Label>
                <Switch
                  id="emailEnabled"
                  checked={emailEnabled}
                  onCheckedChange={setEmailEnabled}
                  data-testid="switch-email-enabled"
                />
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={handleSaveEmailSettings} 
                  disabled={isSavingEmail}
                  data-testid="button-save-email-settings"
                >
                  {isSavingEmail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Settings
                </Button>
                {emailSettings && (
                  <Button 
                    variant="outline" 
                    onClick={handlePollEmails}
                    disabled={isPolling || !emailSettings.hasPassword}
                    data-testid="button-poll-emails"
                  >
                    {isPolling ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Check Emails Now
                  </Button>
                )}
              </div>
              {Array.isArray(pendingImports) && pendingImports.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-amber-500" />
                      <span className="text-sm font-medium">{pendingImports.length} pending import(s)</span>
                    </div>
                    <Link href="/imports">
                      <Button size="sm" variant="outline" data-testid="button-view-imports">
                        Review
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                Delete Account
              </CardTitle>
              <CardDescription>
                Permanently delete your account and all associated data. This action cannot be undone.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" data-testid="button-delete-account-trigger">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete My Account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                      Are you absolutely sure?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="space-y-3">
                      <p>
                        This will permanently delete your account and all your data including:
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-sm">
                        <li>All platforms and their configurations</li>
                        <li>All investment records</li>
                        <li>All valuation history</li>
                        <li>All assets and asset valuations</li>
                      </ul>
                      <p className="font-medium">
                        This action cannot be undone.
                      </p>
                      <div className="pt-2">
                        <Label htmlFor="deleteConfirmation" className="text-foreground">
                          Type <span className="font-mono font-bold">DELETE</span> to confirm:
                        </Label>
                        <Input
                          id="deleteConfirmation"
                          value={deleteConfirmation}
                          onChange={(e) => setDeleteConfirmation(e.target.value)}
                          placeholder="Type DELETE to confirm"
                          className="mt-2"
                          data-testid="input-delete-confirmation"
                        />
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setDeleteConfirmation("")} data-testid="button-cancel-delete">
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteAccount}
                      disabled={isDeletingAccount || deleteConfirmation !== "DELETE"}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-delete"
                    >
                      {isDeletingAccount && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Delete Account
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
