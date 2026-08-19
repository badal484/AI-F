"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getAgencyProfile,
  getAgencyStats,
  listAgencyTenants,
  setAgencyTenantSuspended,
  type TenantWithBilling,
} from "@/domains/agency-admin/actions";
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

const PROFILE_KEY = ["agency-admin-profile"] as const;
const TENANTS_KEY = ["agency-admin-tenants"] as const;
const STATS_KEY = ["agency-admin-stats"] as const;

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

export function AgencyAdminDashboard() {
  const queryClient = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: PROFILE_KEY,
    queryFn: async () => {
      const result = await getAgencyProfile();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: STATS_KEY,
    queryFn: async () => {
      const result = await getAgencyStats();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });

  const { data: tenants, isLoading: tenantsLoading } = useQuery({
    queryKey: TENANTS_KEY,
    queryFn: async () => {
      const result = await listAgencyTenants();
      if ("error" in result) throw new Error(result.error);
      return result.data;
    },
  });

  const suspendMutation = useMutation({
    mutationFn: setAgencyTenantSuspended,
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

  const inviteLink =
    profile && typeof window !== "undefined" ? `${window.location.origin}/signup?agency=${profile.id}` : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        {profile?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- an arbitrary agency-supplied URL, not a local/optimizable asset
          <img src={profile.logoUrl} alt="" className="h-8 w-8 rounded object-contain" />
        )}
        <div>
          <h1 className="text-2xl font-semibold">{profile?.name ?? "Agency"} overview</h1>
          <p className="text-sm text-muted-foreground">Every tenant belonging to your agency.</p>
        </div>
      </div>

      {inviteLink && (
        <Card>
          <CardHeader>
            <CardTitle>Your client invite link</CardTitle>
            <CardDescription>
              Share this with a new client — signing up through it automatically links their workspace to your
              agency.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <code className="block overflow-x-auto rounded-md border bg-muted/30 p-2 text-xs">{inviteLink}</code>
          </CardContent>
        </Card>
      )}

      {statsLoading && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {stats && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Total tenants" value={String(stats.totalTenants)} />
          <StatCard label="Suspended" value={String(stats.suspendedTenants)} />
          <StatCard label="Total users" value={String(stats.totalUsers)} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tenants</CardTitle>
          <CardDescription>Suspending a tenant blocks its dashboard, WhatsApp, and website widget immediately.</CardDescription>
        </CardHeader>
        <CardContent>
          {tenantsLoading && <Skeleton className="h-32 w-full" />}
          {tenants && tenants.length === 0 && (
            <p className="text-sm text-muted-foreground">No tenants yet — share your invite link above.</p>
          )}
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
