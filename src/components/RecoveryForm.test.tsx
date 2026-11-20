import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { RecoveryForm } from "./RecoveryForm";

const client = vi.hoisted(() => ({ requestPasswordReset: vi.fn(), sendVerificationEmail: vi.fn(), resetPassword: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ authClient: client }));

it("requests recovery with neutral confirmation", async () => {
  client.requestPasswordReset.mockResolvedValue({ error: null });
  const user = userEvent.setup();
  render(<RecoveryForm invalidLink />);
  expect(screen.getByRole("alert")).toHaveTextContent("invalid or expired");
  await user.type(screen.getByLabelText("Email"), "USER@example.test");
  await user.click(screen.getByText("Send reset link"));
  expect(client.requestPasswordReset).toHaveBeenCalledWith({ email: "user@example.test", redirectTo: "/recover" });
  expect(await screen.findByRole("status")).toHaveTextContent("If an account uses this address");
});

it.each([true, false])("handles reset completion (accepted: %s)", async (accepted) => {
  client.resetPassword.mockResolvedValue({ error: accepted ? null : { code: "INVALID_TOKEN" } });
  const user = userEvent.setup();
  render(<RecoveryForm token="fixture" />);
  await user.type(screen.getByLabelText(/New password/i), "new-test-password");
  await user.click(screen.getByText("Save password"));
  expect(client.resetPassword).toHaveBeenCalledWith({ token: "fixture", newPassword: "new-test-password" });
  expect(await screen.findByRole(accepted ? "status" : "alert")).toHaveTextContent(accepted ? "Password updated" : "fresh link");
});

it("requests another verification link without exposing account status", async () => {
  client.sendVerificationEmail.mockResolvedValue({ error: null });
  const user = userEvent.setup();
  render(<RecoveryForm verify />);
  await user.type(screen.getByLabelText("Email"), "Owner@example.test");
  await user.click(screen.getByText("Send verification link"));
  expect(client.sendVerificationEmail).toHaveBeenCalledWith({ email: "owner@example.test", callbackURL: "/home" });
  expect(await screen.findByRole("status")).toHaveTextContent("If this address needs verification");
});
