import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/dev-auth", () => ({
  isDevBypass: vi.fn(() => false),
  getDevUser: vi.fn(() => ({
    id: "00000000-0000-0000-0000-000000000001",
    email: "dev@ezsay.local",
    role: "authenticated",
  })),
}));

import { getCurrentUser } from "@/lib/supabase/auth-guard";
import { isDevBypass, getDevUser } from "@/lib/supabase/dev-auth";
import { createClient } from "@/lib/supabase/server";

describe("getCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns dev user when bypass is enabled", async () => {
    vi.mocked(isDevBypass).mockReturnValue(true);

    const user = await getCurrentUser();

    expect(user).toEqual({
      id: "00000000-0000-0000-0000-000000000001",
      email: "dev@ezsay.local",
      role: "authenticated",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns authenticated user from Supabase", async () => {
    vi.mocked(isDevBypass).mockReturnValue(false);
    const mockUser = { id: "user-abc", email: "real@user.com" };
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }),
      },
    } as any);

    const user = await getCurrentUser();

    expect(user).toEqual(mockUser);
  });

  it("returns null when no user is authenticated", async () => {
    vi.mocked(isDevBypass).mockReturnValue(false);
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    } as any);

    const user = await getCurrentUser();

    expect(user).toBeNull();
  });
});
