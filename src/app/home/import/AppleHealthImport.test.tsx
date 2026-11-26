import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { AppleHealthDay } from "@/lib/appleHealth/collector";
import { AppleHealthImport } from "./AppleHealthImport";

const reader = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/appleHealth/readExport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/appleHealth/readExport")>()),
  readAppleHealthExport: reader.read,
}));

const day = (date: string, overrides: Partial<AppleHealthDay> = {}): AppleHealthDay => ({
  date,
  steps: 5000,
  moveCalories: 300,
  restMinutes: 420,
  breatheMinutes: 5,
  sources: { steps: "Apple Watch", moveCalories: "Activity rings" },
  ...overrides,
});

afterEach(() => vi.unstubAllGlobals());

const setup = (savedDates: string[] = []) => {
  const onImported = vi.fn();
  render(
    <AppleHealthImport ownerId="user-1" ownerEmail="owner@example.test" savedDates={new Set(savedDates)} disabled={false} onImported={onImported} />,
  );
  return { onImported, user: userEvent.setup() };
};

const chooseFile = (user: ReturnType<typeof userEvent.setup>) =>
  user.upload(screen.getByLabelText(/Select export.zip/), new File(["zip"], "export.zip", { type: "application/zip" }));

it("previews new days, marks blank totals and leaves saved days out", async () => {
  reader.read.mockResolvedValueOnce({
    days: [day("2026-11-02"), day("2026-11-03", { restMinutes: null, breatheMinutes: null }), day("2026-11-04")],
    recordsUsed: 12,
  });
  const { user } = setup(["2026-11-04"]);
  await chooseFile(user);

  expect(await screen.findByText(/2 new days for owner@example.test/)).toHaveTextContent(
    "1 have one or more blank totals. 1 already saved and will be skipped.",
  );
  const rows = screen.getAllByRole("row");
  expect(rows).toHaveLength(3);
  expect(within(rows[1]).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
    "2026-11-03", "5,000", "300", "—", "—", "Apple Watch, Activity rings",
  ]);
});

it("sends the days with the skip option and reports what was kept", async () => {
  reader.read.mockResolvedValueOnce({ days: [day("2026-11-02"), day("2026-11-03")], recordsUsed: 8 });
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ inserted: 1, skipped: ["2026-11-02"] }), { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
  const { user, onImported } = setup();
  await chooseFile(user);
  await user.click(await screen.findByText("Add days"));

  expect(await screen.findByRole("status")).toHaveTextContent("Added 1 day from Apple Health. 1 day was already saved and left as it was.");
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/metrics?existing=skip");
  expect(JSON.parse(init.body)).toEqual([
    expect.objectContaining({ date: "2026-11-02", source: "apple_health", readinessScore: null, activities: [] }),
    expect.objectContaining({ date: "2026-11-03" }),
  ]);
  expect(onImported).toHaveBeenCalled();
});

it("shows the reader's explanation when the file isn't an export", async () => {
  const { AppleHealthFileError } = await import("@/lib/appleHealth/readExport");
  reader.read.mockRejectedValueOnce(new AppleHealthFileError("This zip doesn't contain export.xml."));
  const { user } = setup();
  await chooseFile(user);
  expect(await screen.findByRole("alert")).toHaveTextContent("This zip doesn't contain export.xml.");
});

it("says so when every day is already saved", async () => {
  reader.read.mockResolvedValueOnce({ days: [day("2026-11-02")], recordsUsed: 3 });
  const { user } = setup(["2026-11-02"]);
  await chooseFile(user);
  expect(await screen.findByRole("alert")).toHaveTextContent("Every day in this export is already saved.");
});
