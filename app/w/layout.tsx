import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { getSubscription, hasActiveSubscription } from "@/lib/stripe/check-subscription";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?redirect=/w");
  }

  const sub = await getSubscription(user.id);
  if (!hasActiveSubscription(sub.status)) {
    redirect("/pricing?reason=subscription_required");
  }

  return <>{children}</>;
}
