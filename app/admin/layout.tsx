import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { isDevBypass } from "@/lib/supabase/dev-auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isDevBypass()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") redirect("/w");
  }

  return (
    <div className="flex h-screen">
      <aside className="w-56 shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <Link href="/w" aria-label="Back to workspace">
            <img src="/brand/ezsay-lockup-black.svg" alt="EzSay" className="h-16 w-auto" />
          </Link>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Admin</span>
        </div>
        <nav className="flex-1 space-y-1 px-2 py-3">
          <Link href="/admin" className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
            Activity Binds
          </Link>
          <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Libraries</p>
          <Link href="/admin/models" className="block rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
            Models
          </Link>
          <Link href="/admin/prompts" className="block rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
            Prompts
          </Link>
          <Link href="/admin/context" className="block rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
            Context
          </Link>
          <Link href="/admin/library" className="block rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
            Phrase Library
          </Link>
          <Link href="/admin/style-training" className="block rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
            Style Training
          </Link>
          <Link href="/admin/log" className="block rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
            Activity Log
          </Link>
          <Link href="/admin/settings" className="block rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
            Settings
          </Link>
          <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Tools</p>
          <Link href="/admin/metrics" className="block rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
            Metrics
          </Link>
          <Link href="/admin/big-test" className="block rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
            Big Test
          </Link>
        </nav>
        <div className="border-t border-gray-200 p-4">
          <Link href="/w" className="text-xs text-gray-500 hover:underline">
            Back to app
          </Link>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
