"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getRequestSession } from "@/lib/auth-session";
import { sendAccountEmail } from "@/lib/accountEmail";
import {
  addInvite,
  inviteExists,
  isOwnerEmail,
  markInviteEmailed,
  normalizeEmail,
  removeInvite,
  signUpLink,
  validateInviteEmail,
} from "@/lib/betaInvites";

export interface InviteState {
  ok: boolean;
  message: string;
}

async function sendInvite(email: string): Promise<boolean> {
  try {
    await sendAccountEmail("invite", email, signUpLink(email));
    await markInviteEmailed(email);
    return true;
  } catch {
    console.error("Unable to send a beta invite email.");
    return false;
  }
}

/** Add, email again or remove a beta invite. Only the verified owner account may use it. */
export async function manageInvite(_: InviteState, form: FormData): Promise<InviteState> {
  const session = await getRequestSession(await headers());
  if (!session?.user.emailVerified || !isOwnerEmail(session.user.email))
    return { ok: false, message: "Only the owner account can manage invites." };
  const op = String(form.get("op"));
  const done = (message: string): InviteState => {
    revalidatePath("/home/settings");
    return { ok: true, message };
  };
  try {
    if (op === "add") {
      const checked = validateInviteEmail(String(form.get("email") ?? ""));
      if (!checked.ok) return checked;
      const added = await addInvite(checked.email, String(form.get("note") ?? ""), session.user.id);
      if (!added) return { ok: false, message: `${checked.email} is already on the list.` };
      if (form.get("send") !== "yes") return done(`Invited ${checked.email}. Copy their sign-up link to send it yourself.`);
      return (await sendInvite(checked.email))
        ? done(`Invited ${checked.email} and emailed their sign-up link.`)
        : done(`Invited ${checked.email}, but the email didn't send. Copy their sign-up link instead.`);
    }
    const email = normalizeEmail(String(form.get("email") ?? ""));
    if (!(await inviteExists(email))) return { ok: false, message: "That invite isn't on the list any more. Reload the page." };
    if (op === "resend")
      return (await sendInvite(email))
        ? done(`Emailed the sign-up link to ${email} again.`)
        : { ok: false, message: "The email didn't send. Copy the sign-up link instead." };
    if (op === "remove") {
      await removeInvite(email);
      return done(`Removed ${email}. If they already made an account, it still works.`);
    }
    return { ok: false, message: "Unknown change." };
  } catch {
    return { ok: false, message: "Could not save. Please try again." };
  }
}
