import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it } from "vitest";
import Demo from "./page";

it("explores fixture comparisons without navigating into an account journal", () => {
  render(<Demo />);
  fireEvent.change(screen.getByLabelText("Prior window"), {
    target: { value: "28" },
  });
  fireEvent.change(screen.getByLabelText("Metric"), {
    target: { value: "breatheMinutes" },
  });
  expect(screen.getByText(/27 observed days/)).toBeInTheDocument();
  expect(screen.getByText(/Prior median:/)).toBeInTheDocument();
  expect(screen.getAllByRole("link", { hidden: true })).toHaveLength(1);
});
