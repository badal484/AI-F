"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listTenants, getPlatformStats, setTenantSuspended, type TenantWithBilling } from "@/domains/platform-admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const TENANTS_KEY = ["platform-admin-tenants"] as const;
const STATS_KEY = ["platform-admin-stats"] as const;

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

export function PlatformAdminDashboard() {
  const queryClient = useQueryClient();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: STATS_KEY,
    queryFn: async () => {
      const result = await getPlatformStats();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });

  const { data: tenants, isLoading: tenantsLoading } = useQuery({
    queryKey: TENANTS_KEY,
    queryFn: async () => {
      const result = await listTenants();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });

  const suspendMutation = useMutation({
    mutationFn: setTenantSuspended,
    onSuccess: (result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      queryClient.setQueryData<TenantWithBilling[]>(TENANTS_KEY, (prev) =>
        (prev ?? []).map((t) => (t.id === result.data.id ? { ...t, ...result.data } : t)),
      );
      queryClient.invalidateQueries({ queryKey: STATS_KEY });
      toast.success(result.data.isSuspended ? "Tenant suspended" : "Tenant reactivated");
    },
    onError: () => toast.error("Something went wrong"),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Platform overview</h1>
        <p className="text-sm text-muted-foreground">Every tenant on this deployment, across all Agencies.</p>
      </div>

      {statsLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total tenants" value={String(stats.totalTenants)} />
          <StatCard label="Suspended" value={String(stats.suspendedTenants)} />
          <StatCard label="Total users" value={String(stats.totalUsers)} />
          <Card>
            <CardHeader className="p-4 pb-0">
              <CardTitle className="text-sm font-normal text-muted-foreground">By plan</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1 p-4 pt-2">
              {stats.tenantsByPlan.map((p) => (
                <Badge key={p.key} variant="outline">
                  {p.key}: {p.count}
                </Badge>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tenants</CardTitle>
          <CardDescription>Suspending a tenant blocks its dashboard, WhatsApp, and website widget immediately.</CardDescription>
        </CardHeader>
        <CardContent>
          {tenantsLoading && <Skeleton className="h-32 w-full" />}
          {tenants && tenants.length === 0 && <p className="text-sm text-muted-foreground">No tenants yet.</p>}
          {tenants && tenants.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell className="font-medium">
                      {tenant.name}
                      <span className="ml-2 text-xs text-muted-foreground">/{tenant.slug}</span>
                    </TableCell>
                    <TableCell>{tenant.subscription?.planTier ?? "FREE"}</TableCell>
                    <TableCell>
                      {tenant.isSuspended ? (
                        <Badge variant="destructive">Suspended</Badge>
                      ) : (
                        <Badge variant="outline">{tenant.subscription?.status ?? "Active"}</Badge>
                      )}
                    </TableCell>
                    <TableCell>{tenant._count.users}</TableCell>
                    <TableCell>{new Date(tenant.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      {tenant.isSuspended ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={suspendMutation.isPending}
                          onClick={() => suspendMutation.mutate({ tenantId: tenant.id, isSuspended: false })}
                        >
                          Reactivate
                        </Button>
                      ) : (
                        <AlertDialog>
                          <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
                            Suspend
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Suspend &ldquo;{tenant.name}&rdquo;?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Blocks dashboard access for every user on this tenant, and stops it from receiving
                                WhatsApp/website-widget messages, immediately. Reversible at any time.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => suspendMutation.mutate({ tenantId: tenant.id, isSuspended: true })}
                              >
                                Suspend
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
