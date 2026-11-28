import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { CheckInField } from "@/lib/checkInValues";
vi.mock("./checkInActions", () => ({ submitCheckIn: vi.fn(async () => ({ ok: true, message: "Saved." })) }));
import { CheckInForm } from "./CheckInForm";

const base = { unit: null, position: 0, systemKey: null, preset: null, promptMetrics: [], retired: false };
const fields: CheckInField[] = [
  { ...base, id: "e", label: "Energy", kind: "score", scoreLabels: ["Empty", "Low", "Okay", "Good", "Great"] },
  { ...base, id: "f", label: "Flare today", kind: "yes_no", scoreLabels: null },
  { ...base, id: "l", label: "Fluids", kind: "number", scoreLabels: null, unit: "L" },
  { ...base, id: "n", label: "Notes", kind: "notes", scoreLabels: null },
];
const hidden = (name: string) =>
  [...document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)].map((input) => input.value);

it("starts empty, shows each score's description and lets a choice be undone", async () => {
  render(<CheckInForm date="2026-11-26" owner="o" fields={fields} answers={{}} recentTags={["heat"]} />);
  const user = userEvent.setup();
  expect(hidden("field_e")).toEqual([""]);
  expect(hidden("field_f")).toEqual([""]);
  await user.click(screen.getByRole("radio", { name: "2: Low" }));
  expect(hidden("field_e")).toEqual(["2"]);
  expect(screen.getByText("Low")).toBeInTheDocument();
  await user.click(screen.getByRole("radio", { name: "2: Low" }));
  expect(hidden("field_e")).toEqual([""]);
  await user.click(screen.getByRole("radio", { name: "No" }));
  expect(hidden("field_f")).toEqual(["no"]);
  expect(screen.getByText("L")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save check-in" })).toBeInTheDocument();
  expect(screen.queryByText("Clear this day")).not.toBeInTheDocument();
});

it("adds, reuses and removes tags", async () => {
  render(<CheckInForm date="2026-11-26" owner="o" fields={fields} answers={{}} recentTags={["heat"]} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "heat" }));
  await user.type(screen.getByLabelText("New tag"), "travel{Enter}");
  expect(hidden("tag_n")).toEqual(["heat", "travel"]);
  await user.click(screen.getByRole("button", { name: "heat" }));
  expect(hidden("tag_n")).toEqual(["travel"]);
});

it("shows saved answers and offers to clear the day", () => {
  render(
    <CheckInForm
      date="2026-11-26"
      owner="o"
      fields={fields}
      revision="r1"
      answers={{
        e: { kind: "score", score: 4 },
        f: { kind: "yes_no", yesNo: true },
        l: { kind: "number", number: 2.5 },
        n: { kind: "notes", tags: ["heat"], note: "Hot day" },
      }}
      recentTags={[]}
    />,
  );
  expect(screen.getByRole("radio", { name: "4: Good" })).toHaveAttribute("aria-checked", "true");
  expect(hidden("field_f")).toEqual(["yes"]);
  expect(screen.getByDisplayValue("2.5")).toBeInTheDocument();
  expect(screen.getByDisplayValue("Hot day")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  expect(screen.getByText("Clear this day")).toBeInTheDocument();
});
