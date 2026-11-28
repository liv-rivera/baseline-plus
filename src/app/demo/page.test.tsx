import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/demo", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const { default: Demo } = await import("./page");

it("renders the real dashboard with six weeks of sample data and no account links", () => {
  render(<Demo />);
  expect(screen.getByText(/42 days of records/)).toBeInTheDocument();
  expect(screen.getByRole("img", { name: /Training minutes by sport and readiness/ })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Recent sessions" })).toBeInTheDocument();
  expect(screen.getByText("Sample data · read-only")).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Prior window"), { target: { value: "28" } });
  fireEvent.change(screen.getByLabelText("Metric"), { target: { value: "breatheMinutes" } });
  expect(screen.getByText(/28 observed days/)).toBeInTheDocument();
  expect(screen.getByText(/Prior median:/)).toBeInTheDocument();

  const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
  expect(hrefs.every((href) => !href?.startsWith("/home"))).toBe(true);
});
