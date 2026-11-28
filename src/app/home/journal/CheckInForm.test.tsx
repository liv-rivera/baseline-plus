import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BANNED_PROMPT_WORDS, type CheckInPrompt as CheckInPromptData } from "@/lib/checkInPrompts";
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

describe("metric questions", () => {
  const prompt = (over: Partial<CheckInPromptData> = {}): CheckInPromptData => ({
    metric: "hrv",
    direction: "below",
    fieldId: "e",
    text: "HRV is lower than usual (38 ms, usual 45 to 62). Is your energy lower than usual today?",
    value: 38,
    low: 45,
    high: 62,
    daysUsed: 26,
    history: [
      { date: "2026-11-24", value: 50 },
      { date: "2026-11-25", value: 55 },
      { date: "2026-11-26", value: 38 },
    ],
    ...over,
  });

  beforeEach(() => localStorage.clear());

  it("shows the question above its field and never fills in an answer", async () => {
    render(<CheckInForm date="2026-11-26" owner="o" fields={fields} answers={{}} recentTags={[]} prompts={[prompt()]} />);
    const note = screen.getByRole("note", { name: "Question about HRV" });
    expect(note).toHaveTextContent("Is your energy lower than usual today?");
    // It sits directly before the Energy field.
    expect(note.nextElementSibling).toHaveAttribute("id", "field-e");
    expect(hidden("field_e")).toEqual([""]);
    await userEvent.setup().click(screen.getByRole("button", { name: "Why?" }));
    expect(screen.getByText(/Your HRV for this day was 38 ms\. Your usual range is 45 ms to 62 ms/)).toHaveTextContent(
      "on 26 of the previous 28 days",
    );
    expect(screen.getByRole("img", { name: /HRV over 3 days/ })).toBeInTheDocument();
    expect(hidden("field_e")).toEqual([""]);
  });

  it("goes away when the field is answered, and comes back if the answer is undone", async () => {
    render(<CheckInForm date="2026-11-26" owner="o" fields={fields} answers={{}} recentTags={[]} prompts={[prompt()]} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "2: Low" }));
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "2: Low" }));
    expect(screen.getByRole("note")).toBeInTheDocument();
  });

  it("stays dismissed for that day", async () => {
    const { unmount } = render(
      <CheckInForm date="2026-11-26" owner="o" fields={fields} answers={{}} recentTags={[]} prompts={[prompt()]} />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Dismiss the HRV question" }));
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    unmount();
    render(<CheckInForm date="2026-11-26" owner="o" fields={fields} answers={{}} recentTags={[]} prompts={[prompt()]} />);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    cleanup();
    render(<CheckInForm date="2026-11-27" owner="o" fields={fields} answers={{}} recentTags={[]} prompts={[prompt()]} />);
    expect(screen.getByRole("note")).toBeInTheDocument();
  });

  it("isn't shown for a field that already has a saved answer", () => {
    render(
      <CheckInForm
        date="2026-11-26"
        owner="o"
        fields={fields}
        answers={{ e: { kind: "score", score: 3 } }}
        revision="r"
        recentTags={[]}
        prompts={[prompt()]}
      />,
    );
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("uses no advice, alarm or condition words in the explanation either", async () => {
    render(<CheckInForm date="2026-11-26" owner="o" fields={fields} answers={{}} recentTags={[]} prompts={[prompt()]} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Why?" }));
    const text = screen.getByRole("note").textContent ?? "";
    for (const word of BANNED_PROMPT_WORDS) expect(new RegExp(`\\b${word}`, "i").test(text), word).toBe(false);
  });
});
