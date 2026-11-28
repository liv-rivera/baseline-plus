import { beforeEach, it, expect, vi } from "vitest";
const { session, query } = vi.hoisted(() => ({
  session: vi.fn(),
  query: vi.fn(),
}));
vi.mock("@/lib/auth-session", () => ({ getRequestSession: session }));
vi.mock("@/lib/database", () => ({ getDatabasePool: () => ({ query }) }));
import { GET } from "./route";
beforeEach(() => {
  session.mockReset().mockResolvedValue({ user: { id: "owned-user" } });
  query.mockReset();
});
it("denies signed-out exports before querying records", async () => {
  session.mockResolvedValue(null);
  expect((await GET(new Request("http://localhost/api/export"))).status).toBe(
    401,
  );
  expect(query).not.toHaveBeenCalled();
});
it("labels export units and uses the session owner regardless of URL input", async () => {
  query.mockResolvedValue({ rows: [{ metrics: [], check_ins: [] }] });
  const result = await GET(
    new Request("http://localhost/api/export?user=other"),
  );
  expect(query.mock.calls[0][1]).toEqual(["owned-user"]);
  expect(result.headers.get("cache-control")).toContain("no-store");
  expect(await result.json()).toMatchObject({
    units: { steps: "count" },
    metrics: [],
    check_ins: [],
  });
});
it("reports failures without database details or private text", async () => {
  query.mockRejectedValue(new Error("fixture private note"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const result = await GET(new Request("http://localhost/api/export"));
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("private note");
    expect(log).toHaveBeenCalledWith("Unable to export account records.");
  } finally {
    log.mockRestore();
  }
});
