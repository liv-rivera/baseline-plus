import { it, expect, vi, beforeEach } from "vitest";
const { session, deleteAllRecords } = vi.hoisted(() => ({
  session: vi.fn(),
  deleteAllRecords: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth-session", () => ({ getRequestSession: session }));
vi.mock("@/lib/deleteAllData", () => ({ deleteAllRecords }));
import { deleteAllData } from "./actions";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};
const initial = { ok: false, message: "" };

beforeEach(() => {
  session.mockReset().mockResolvedValue({ user: { id: "owner-1" } });
  deleteAllRecords.mockReset().mockResolvedValue({ days: 2 });
});

it("refuses without a session or for another account", async () => {
  session.mockResolvedValueOnce(null);
  expect((await deleteAllData(initial, form({ owner: "owner-1", confirm: "DELETE" }))).ok).toBe(false);
  expect((await deleteAllData(initial, form({ owner: "someone-else", confirm: "DELETE" }))).ok).toBe(false);
  expect(deleteAllRecords).not.toHaveBeenCalled();
});

it("refuses until DELETE is typed exactly", async () => {
  const result = await deleteAllData(initial, form({ owner: "owner-1", confirm: "delete" }));
  expect(result).toEqual({ ok: false, message: "Type DELETE to confirm." });
  expect(deleteAllRecords).not.toHaveBeenCalled();
});

it("deletes only the signed-in owner's records", async () => {
  const result = await deleteAllData(initial, form({ owner: "owner-1", confirm: "DELETE" }));
  expect(deleteAllRecords).toHaveBeenCalledWith("owner-1");
  expect(result.ok).toBe(true);
  expect(result.message).toContain("Deleted 2 days");
});

it("reports a failure without details", async () => {
  deleteAllRecords.mockRejectedValue(new Error("db detail"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const result = await deleteAllData(initial, form({ owner: "owner-1", confirm: "DELETE" }));
  expect(result).toEqual({ ok: false, message: "Nothing was deleted. Please try again." });
  log.mockRestore();
});
