import "dotenv/config";
import { getPlatformDb } from "../src/tenant";

/**
 * Local/staging provisioning script — NOT wired into any build, deploy,
 * or migration step, and never runs automatically (invoke explicitly via
 * `npm run db:seed`). Entirely idempotent (every write is an `upsert`
 * keyed on a real unique constraint), so re-running it is always safe and
 * never wipes or duplicates existing data — it only fills in what's
 * missing.
 *
 * Provisions one Agency, one Tenant (with default Mon-Fri hours, one
 * Service, one StaffMember), and — only if the two SEED_PLATFORM_ADMIN_*
 * env vars are set — one PlatformAdmin. PlatformAdmin.supabaseUserId must
 * reference a real Supabase auth user (same rule as User.supabaseUserId),
 * so unlike everything else here it can't be fabricated: per
 * MASTER_INSTRUCTIONS.md §7 ("No fake implementations... Log them as NOT
 * CONFIGURED"), this step is skipped with a clear message rather than
 * inventing a placeholder id that would silently grant nothing (or worse,
 * collide with a real one later).
 */
async function main() {
  const db = getPlatformDb();

  const agency = await db.agency.upsert({
    where: { slug: "demo-agency" },
    update: {},
    create: {
      name: "Demo Reseller Agency",
      slug: "demo-agency",
      supportEmail: "support@demo-agency.example",
    },
  });
  console.log("Agency ready:", { id: agency.id, slug: agency.slug });

  const tenant = await db.tenant.upsert({
    where: { slug: "demo-tenant" },
    update: {},
    create: {
      name: "Demo Business",
      slug: "demo-tenant",
      agencyId: agency.id,
      timezone: "America/New_York",
    },
  });
  console.log("Tenant ready:", { id: tenant.id, slug: tenant.slug });

  const location = await db.location.findFirst({ where: { tenantId: tenant.id, isPrimary: true } });
  const resolvedLocation =
    location ??
    (await db.location.create({
      data: {
        tenantId: tenant.id,
        name: "Main Location",
        addressLine1: "1 Demo Street",
        city: "Springfield",
        state: "IL",
        postalCode: "62701",
        isPrimary: true,
      },
    }));
  console.log("Location ready:", { id: resolvedLocation.id, name: resolvedLocation.name });

  // Default Mon-Fri 9-5 hours, closed weekends — upsert per day so
  // re-running never duplicates rows (unique on [locationId, dayOfWeek]).
  for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek++) {
    await db.locationHours.upsert({
      where: { locationId_dayOfWeek: { locationId: resolvedLocation.id, dayOfWeek } },
      update: {},
      create: {
        tenantId: tenant.id,
        locationId: resolvedLocation.id,
        dayOfWeek,
        isClosed: dayOfWeek === 0 || dayOfWeek === 6,
      },
    });
  }
  console.log("Location hours ready (Mon-Fri 9am-5pm, closed weekends)");

  const service = await db.service.findFirst({ where: { tenantId: tenant.id } });
  const resolvedService =
    service ??
    (await db.service.create({
      data: {
        tenantId: tenant.id,
        name: "Standard Consultation",
        description: "A general 30-minute consultation.",
        durationMinutes: 30,
        priceCents: 5000,
      },
    }));
  console.log("Service ready:", { id: resolvedService.id, name: resolvedService.name });

  const staffMember = await db.staffMember.findFirst({ where: { tenantId: tenant.id } });
  const resolvedStaffMember =
    staffMember ??
    (await db.staffMember.create({
      data: {
        tenantId: tenant.id,
        locationId: resolvedLocation.id,
        name: "Demo Staff Member",
        title: "Staff",
      },
    }));
  console.log("Staff member ready:", { id: resolvedStaffMember.id, name: resolvedStaffMember.name });

  const platformAdminSupabaseUserId = process.env.SEED_PLATFORM_ADMIN_SUPABASE_USER_ID;
  const platformAdminEmail = process.env.SEED_PLATFORM_ADMIN_EMAIL;
  if (platformAdminSupabaseUserId && platformAdminEmail) {
    const platformAdmin = await db.platformAdmin.upsert({
      where: { supabaseUserId: platformAdminSupabaseUserId },
      update: {},
      create: { supabaseUserId: platformAdminSupabaseUserId, email: platformAdminEmail },
    });
    console.log("PlatformAdmin ready:", { id: platformAdmin.id, email: platformAdmin.email });
  } else {
    console.log(
      "PlatformAdmin NOT seeded — set SEED_PLATFORM_ADMIN_SUPABASE_USER_ID and SEED_PLATFORM_ADMIN_EMAIL. " +
        "A PlatformAdmin must reference a real Supabase auth user id (create one via the Supabase dashboard's " +
        "Authentication > Users, or supabase.auth.admin.createUser()) — there is deliberately no way to fabricate " +
        "one here; see docs/DATABASE.md's PlatformAdmin entry for why.",
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await getPlatformDb().$disconnect();
  });
