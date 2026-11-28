import { beforeEach, expect, it, vi } from "vitest";

const { session, saveVitals } = vi.hoisted(() => ({ session: vi.fn(), saveVitals: vi.fn() }));
vi.mock("@/lib/auth-session", () => ({ getRequestSession: session }));
vi.mock("@/lib/vitalsRepository", () => ({ saveVitals }));
import { POST } from "./route";

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request("http://localhost/api/vitals", { method: "POST", body: JSON.stringify(body), headers }));

beforeEach(() => {
  session.mockReset().mockResolvedValue({ user: { id: "owner-1" } });
  saveVitals.mockReset().mockResolvedValue({ saved: 2 });
});

it("saves valid days for the signed-in owner only", async () => {
  const days = [
    { date: "2026-11-01", hrv: 45.5, restingHeartRate: 58 },
    { date: "2026-11-02", hrv: null, restingHeartRate: 61 },
  ];
  const response = await post(days, { "X-Baseline-Preview-Owner": "owner-1" });
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ saved: 2 });
  expect(saveVitals).toHaveBeenCalledWith("owner-1", days);
});

it("refuses signed-out requests and a changed account", async () => {
  session.mockResolvedValueOnce(null);
  expect((await post([{ date: "2026-11-01", hrv: 40, restingHeartRate: null }])).status).toBe(401);
  const switched = await post([{ date: "2026-11-01", hrv: 40, restingHeartRate: null }], { "X-Baseline-Preview-Owner": "owner-2" });
  expect(switched.status).toBe(409);
  expect(saveVitals).not.toHaveBeenCalled();
});

it.each([
  [[], /between 1/],
  [[{ date: "2026-02-30", hrv: 40, restingHeartRate: null }], /real calendar dates/],
  [[{ date: "2026-11-01", hrv: 0, restingHeartRate: null }], /HRV/],
  [[{ date: "2026-11-01", hrv: null, restingHeartRate: 400 }], /Resting heart rate/],
  [[{ date: "2026-11-01", hrv: "40", restingHeartRate: null }], /HRV/],
  [
    [
      { date: "2026-11-01", hrv: 40, restingHeartRate: null },
      { date: "2026-11-01", hrv: 41, restingHeartRate: null },
    ],
    /more than one/,
  ],
])("rejects bad input %#", async (body, message) => {
  const response = await post(body);
  expect(response.status).toBe(400);
  expect((await response.json()).error).toMatch(message);
  expect(saveVitals).not.toHaveBeenCalled();
});

it("hides database errors", async () => {
  saveVitals.mockRejectedValueOnce(new Error("secret detail"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await post([{ date: "2026-11-01", hrv: 40, restingHeartRate: null }]);
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("secret");
  log.mockRestore();
});
