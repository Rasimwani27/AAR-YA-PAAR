import { DashboardShell } from "@/app/components/dashboard-shell";

/** Avoid stale static shell without client hydration in some dev/proxy setups. */
export const dynamic = "force-dynamic";

export default function Home() {
  return <DashboardShell />;
}
