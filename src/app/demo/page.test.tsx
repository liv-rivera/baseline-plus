import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/demo", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const { default: Demo } = await import("./page");

it("renders the real dashboard with sample data and no account links", () => {
  render(<Demo />);
  expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: /Training minutes by sport and readiness/ })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Recent" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Comparisons" })).toBeInTheDocument();
  expect(screen.getByText("Sample data · read-only")).toBeInTheDocument();

  expect(screen.queryByRole("heading", { name: "Personal comparisons" })).toBeNull();

  const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
  expect(hrefs.every((href) => !href?.startsWith("/home"))).toBe(true);
});
