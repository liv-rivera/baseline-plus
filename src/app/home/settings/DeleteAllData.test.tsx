import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { it, expect, vi, beforeAll, beforeEach } from "vitest";
const { deleteAllData } = vi.hoisted(() => ({ deleteAllData: vi.fn() }));
vi.mock("./actions", () => ({ deleteAllData }));
import { DeleteAllData } from "./DeleteAllData";

beforeAll(() => {
  // jsdom has <dialog> but not its modal methods.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
beforeEach(() => deleteAllData.mockReset());

it("asks for confirmation in a pop-up before anything is deleted", async () => {
  render(<DeleteAllData owner="owner-1" />);
  const user = userEvent.setup();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Delete all data" }));
  const dialog = screen.getByRole("dialog", { name: "Delete all your data?" });
  const confirm = screen.getAllByRole("button", { name: "Delete all data" })[1];
  expect(dialog).toContainElement(confirm);
  expect(confirm).toBeDisabled();
  await user.type(screen.getByLabelText("Type DELETE to confirm"), "delete");
  expect(confirm).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(deleteAllData).not.toHaveBeenCalled();
});

it("deletes after DELETE is typed and reports the result", async () => {
  deleteAllData.mockResolvedValue({ ok: true, message: "Deleted 3 days of records." });
  render(<DeleteAllData owner="owner-1" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Delete all data" }));
  await user.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
  await user.click(screen.getAllByRole("button", { name: "Delete all data" })[1]);
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Deleted 3 days"));
  const form: FormData = deleteAllData.mock.calls[0][1];
  expect(form.get("owner")).toBe("owner-1");
  expect(form.get("confirm")).toBe("DELETE");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
