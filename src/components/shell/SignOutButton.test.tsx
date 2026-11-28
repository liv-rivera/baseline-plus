import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const signOut = vi.fn();
const replace = vi.fn();
vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: () => signOut() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));

const { SignOutButton } = await import("./SignOutButton");

beforeEach(() => {
  signOut.mockReset();
  replace.mockReset();
});

it("signs out and returns to the sign-in page", async () => {
  signOut.mockResolvedValue({ error: null });
  render(<SignOutButton />);
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
});

it("says so when signing out fails", async () => {
  signOut.mockResolvedValue({ error: { message: "nope" } });
  render(<SignOutButton />);
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't sign out");
  expect(replace).not.toHaveBeenCalled();
});
