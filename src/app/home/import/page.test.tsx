import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const { parse, refresh, state } = vi.hoisted(() => ({
  parse: vi.fn(),
  refresh: vi.fn(),
  state: {
    session: { user: { id: "owner-a", email: "a@example.test" } },
    metrics: [] as { date: string }[],
  },
}));
vi.mock("papaparse", () => ({ default: { parse } }));
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: state.session }) },
}));
vi.mock("@/lib/useDailyMetrics", () => ({
  useDailyMetrics: () => ({
    metrics: state.metrics,
    loading: false,
    error: null,
    refresh,
  }),
}));
import ImportPage from "./page";
const headers = [
  "date",
  "steps",
  "moveCalories",
  "restMinutes",
  "breatheMinutes",
];
const row = {
  date: "2026-11-01",
  steps: "100",
  moveCalories: "10",
  restMinutes: "5",
  breatheMinutes: "0",
};
function parsed() {
  return { data: [row], errors: [], meta: { fields: headers } };
}
async function upload() {
  await userEvent.upload(
    screen.getByLabelText("CSV file"),
    new File(["fixture"], "daily.csv", { type: "text/csv" }),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  state.session = { user: { id: "owner-a", email: "a@example.test" } };
  state.metrics = [];
  parse.mockImplementation((_file, options) => options.complete(parsed()));
});
afterEach(() => vi.unstubAllGlobals());
it("blocks duplicate rows and gives an action to refresh before retrying", async () => {
  state.metrics = [{ date: row.date }];
  render(<ImportPage />);
  await upload();
  expect(screen.getByRole("alert")).toHaveTextContent("already exists");
  expect(screen.queryByRole("button", { name: "Add records" })).toBeNull();
  await userEvent.click(
    screen.getByRole("button", { name: "Refresh saved records" }),
  );
  expect(refresh).toHaveBeenCalled();
});
it("shows parsing and allows clearing a delayed parse without resurrecting its preview", async () => {
  let complete: ((value: unknown) => void) | undefined;
  parse.mockImplementation((_file, options) => {
    complete = options.complete;
  });
  render(<ImportPage />);
  await upload();
  expect(screen.getByRole("status")).toHaveTextContent("Checking");
  await userEvent.click(screen.getByRole("button", { name: "Clear preview" }));
  act(() => complete?.(parsed()));
  expect(screen.queryByText("Ready to import")).toBeNull();
  expect(screen.getByLabelText("CSV file")).toHaveValue("");
});
it("submits one batch while pending and resets the file input for repeat selection", async () => {
  let finish: ((response: unknown) => void) | undefined;
  const send = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal("fetch", send);
  render(<ImportPage />);
  await upload();
  const add = screen.getByRole("button", { name: "Add records" });
  fireEvent.click(add);
  fireEvent.click(add);
  expect(send).toHaveBeenCalledTimes(1);
  expect(add).toBeDisabled();
  await act(async () =>
    finish?.({ ok: true, json: async () => ({ inserted: 1 }) }),
  );
  expect(await screen.findByRole("status")).toHaveTextContent(
    "1 record added to a@example.test",
  );
  expect(screen.getByLabelText("CSV file")).toHaveValue("");
  expect(refresh).toHaveBeenCalled();
});
it("keeps the preview account visible and blocks submission after the session changes", async () => {
  const { rerender } = render(<ImportPage />);
  await upload();
  state.session = { user: { id: "owner-b", email: "b@example.test" } };
  rerender(<ImportPage />);
  expect(
    screen.getByText(/valid record for a@example.test/),
  ).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("Your account changed");
  expect(screen.getByRole("button", { name: "Add records" })).toBeDisabled();
});
it("preserves a rejected preview with useful recovery actions", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: "One or more dates already have a record.",
      }),
    }),
  );
  render(<ImportPage />);
  await upload();
  await userEvent.click(screen.getByRole("button", { name: "Add records" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("One or more dates"),
  );
  expect(screen.getByRole("button", { name: "Add records" })).toBeEnabled();
});

it("bounds the displayed preview while submitting every validated record", async () => {
  const rows = Array.from({ length: 51 }, (_, i) => {
    const day = new Date("2026-01-01T12:00:00Z");
    day.setUTCDate(i + 1);
    return { ...row, date: day.toISOString().slice(0, 10) };
  });
  parse.mockImplementation((_file, options) =>
    options.complete({ data: rows, errors: [], meta: { fields: headers } }),
  );
  const send = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ inserted: 51 }) });
  vi.stubGlobal("fetch", send);
  render(<ImportPage />);
  await upload();
  expect(screen.getAllByRole("row")).toHaveLength(51);
  expect(screen.getByText(/Showing the first 50 of 51/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Add records" }));
  expect(JSON.parse(send.mock.calls[0][1].body)).toHaveLength(51);
  expect(await screen.findByRole("status")).toHaveTextContent(
    "51 records added",
  );
});
it("switches from a pending file parse to browser totals without retaining the parsing state", async () => {
  let complete: ((value: unknown) => void) | undefined;
  parse.mockImplementation((_file, options) => {
    complete = options.complete;
  });
  localStorage.setItem(
    "baseline.importedMetrics.v1",
    JSON.stringify([
      {
        date: "2026-10-01",
        steps: 1,
        moveCalories: 0,
        restMinutes: 0,
        breatheMinutes: 0,
      },
    ]),
  );
  render(<ImportPage />);
  await upload();
  await userEvent.click(screen.getByText("Import earlier browser data"));
  await userEvent.click(
    screen.getByRole("button", { name: "Preview browser totals" }),
  );
  act(() => complete?.(parsed()));
  expect(screen.queryByText("Checking the file…")).toBeNull();
  expect(screen.getByText("2026-10-01")).toBeInTheDocument();
  expect(screen.queryByText("2026-11-01")).toBeNull();
  localStorage.removeItem("baseline.importedMetrics.v1");
});
