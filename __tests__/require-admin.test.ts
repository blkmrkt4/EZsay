import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/dev-auth", () => ({
  isDevBypass: vi.fn(() => false),
  getDevUser: vi.fn(() => ({
    id: "00000000-0000-0000-0000-000000000001",
    email: "dev@ezsay.local",
  })),
}));

import { requireAdmin } from "@/lib/supabase/require-admin";
import { isDevBypass } from "@/lib/supabase/dev-auth";
import { createClient } from "@/lib/supabase/server";

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns dev user in bypass mode", async () => {
    vi.mocked(isDevBypass).mockReturnValue(true);

    const result = await requireAdmin();

    expect(result).toEqual({
      user: { id: "00000000-0000-0000-0000-000000000001", email: "dev@ezsay.local" },
    });
  });

  it("returns 401 when no user is authenticated", async () => {
    vi.mocked(isDevBypass).mockReturnValue(false);
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    } as any);

    const result = await requireAdmin();

    expect(result).toEqual({ error: "Unauthorized", status: 401 });
  });

  it("returns 403 when user is not admin", async () => {
    vi.mocked(isDevBypass).mockReturnValue(false);
    const mockUser = { id: "user-1", email: "user@test.com" };
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { role: "user" } }),
          }),
        }),
      }),
    } as any);

    const result = await requireAdmin();

    expect(result).toEqual({ error: "Forbidden", status: 403 });
  });

  it("returns user when admin role confirmed", async () => {
    vi.mocked(isDevBypass).mockReturnValue(false);
    const mockUser = { id: "admin-1", email: "admin@test.com" };
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { role: "admin" } }),
          }),
        }),
      }),
    } as any);

    const result = await requireAdmin();

    expect(result).toEqual({ user: mockUser });
  });

  it("returns 403 when profile query returns null", async () => {
    vi.mocked(isDevBypass).mockReturnValue(false);
    const mockUser = { id: "user-2", email: "user@test.com" };
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      }),
    } as any);

    const result = await requireAdmin();

    expect(result).toEqual({ error: "Forbidden", status: 403 });
  });
});
