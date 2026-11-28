import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/database", () => ({ getDatabasePool: () => ({ query }) }));
import { mayRegister, signUpLink, validateInviteEmail } from "./betaInvites";

beforeEach(() => {
  vi.stubEnv("BASELINE_OWNER_EMAIL", " Owner@Example.test ");
  query.mockReset().mockResolvedValue({ rowCount: 0, rows: [] });
});
afterEach(() => vi.unstubAllEnvs());

it("lets the owner register without a database lookup", async () => {
  expect(await mayRegister("OWNER@example.test")).toBe(true);
  expect(query).not.toHaveBeenCalled();
});

it("lets an invited address register and turns everyone else away", async () => {
  query.mockResolvedValueOnce({ rowCount: 1, rows: [{}] });
  expect(await mayRegister(" Sam@Example.test")).toBe(true);
  expect(query).toHaveBeenLastCalledWith(expect.any(String), ["sam@example.test"]);
  expect(await mayRegister("stranger@example.test")).toBe(false);
});

it("closes registration entirely, invites included, when no owner is set", async () => {
  vi.stubEnv("BASELINE_OWNER_EMAIL", "");
  query.mockResolvedValue({ rowCount: 1, rows: [{}] });
  expect(await mayRegister("sam@example.test")).toBe(false);
  expect(await mayRegister("")).toBe(false);
});

it("validates invite addresses", () => {
  expect(validateInviteEmail(" Sam@Example.test ")).toEqual({ ok: true, email: "sam@example.test" });
  expect(validateInviteEmail("").ok).toBe(false);
  expect(validateInviteEmail("sam@localhost").ok).toBe(false);
  expect(validateInviteEmail("two words@example.test").ok).toBe(false);
  expect(validateInviteEmail("owner@example.test").ok).toBe(false);
});

it("builds a sign-up link on the configured app address", () => {
  vi.stubEnv("BETTER_AUTH_URL", "https://baseline.example.test/");
  expect(signUpLink("Sam+run@Example.test")).toBe("https://baseline.example.test/?join=sam%2Brun%40example.test");
});
