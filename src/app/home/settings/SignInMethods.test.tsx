import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { it, expect, vi, beforeEach } from "vitest";
const { client, refresh } = vi.hoisted(() => ({
  client: {
    linkSocial: vi.fn(),
    unlinkAccount: vi.fn(),
    signIn: { email: vi.fn() },
  },
  refresh: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({ authClient: client }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
import { SignInMethods } from "./SignInMethods";
beforeEach(() => vi.clearAllMocks());
it("reauthenticates the current email and clears the submitted password", async () => {
  client.signIn.email.mockResolvedValue({});
  render(<SignInMethods enabled email="fixture@example.test" />);
  const user = userEvent.setup();
  await user.click(screen.getByText("Sign in again to change methods"));
  await user.type(
    screen.getByLabelText("Current password"),
    "fixture-password",
  );
  await user.click(screen.getByRole("button", { name: "Verify password" }));
  expect(client.signIn.email).toHaveBeenCalledWith({
    email: "fixture@example.test",
    password: "fixture-password",
  });
  expect(screen.getByLabelText("Current password")).toHaveValue("");
  expect(refresh).toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent("Sign-in refreshed");
});
it("unlinks only the listed account and refreshes the methods", async () => {
  client.unlinkAccount.mockResolvedValue({});
  render(
    <SignInMethods enabled email="fixture@example.test" googleId="owned-id" />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Disconnect Google" }),
  );
  expect(client.unlinkAccount).toHaveBeenCalledWith({ accountId: "owned-id" });
  expect(refresh).toHaveBeenCalled();
});
it("reports a link conflict without exposing another identity", async () => {
  client.linkSocial.mockResolvedValue({ error: {} });
  render(<SignInMethods enabled email="fixture@example.test" />);
  await userEvent.click(screen.getByRole("button", { name: "Link Google" }));
  expect(screen.getByRole("status")).toHaveTextContent("Could not change");
  expect(client.linkSocial).toHaveBeenCalledWith(
    expect.objectContaining({ errorCallbackURL: "/home/settings?error=link" }),
  );
});
