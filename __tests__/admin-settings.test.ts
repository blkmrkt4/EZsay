import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/require-admin", () => ({
  requireAdmin: vi.fn(),
}));

const mockInsert = vi.fn();
vi.mock("@/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockResolvedValue([]),
    }),
    insert: (...args: any[]) => mockInsert(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  adminSettings: { key: "key" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

import { POST } from "@/app/api/admin/settings/route";
import { requireAdmin } from "@/lib/supabase/require-admin";

// ── Helpers ──────────────────────────────────────────────────────────

function makeRequest(body: any) {
  return {
    json: () => Promise.resolve(body),
  } as any;
}

// ── Tests ────────────────────────────────────────────────────────────

describe("POST /api/admin/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue({
      user: { id: "admin-1", email: "admin@test.com" },
    });
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    });
  });

  it("rejects non-admin users", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      error: "Forbidden",
      status: 403,
    } as any);

    const res = await POST(makeRequest({ key: "openrouter_api_key", value: "sk-test" }));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
  });

  it("rejects missing key", async () => {
    const res = await POST(makeRequest({ value: "something" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/non-empty/);
  });

  it("rejects non-string value", async () => {
    const res = await POST(makeRequest({ key: "openrouter_api_key", value: 123 }));
    const json = await res.json();

    expect(res.status).toBe(400);
  });

  it("rejects unknown setting keys", async () => {
    const res = await POST(makeRequest({ key: "evil_key", value: "drop table" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/Unknown setting key/);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("accepts openrouter_api_key", async () => {
    const res = await POST(makeRequest({ key: "openrouter_api_key", value: "sk-or-test" }));
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(mockInsert).toHaveBeenCalled();
  });

  it("accepts tavily_api_key", async () => {
    const res = await POST(makeRequest({ key: "tavily_api_key", value: "tvly-test" }));
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(mockInsert).toHaveBeenCalled();
  });

  it("accepts plan_limits", async () => {
    const res = await POST(makeRequest({ key: "plan_limits", value: "{}" }));
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(mockInsert).toHaveBeenCalled();
  });
});
