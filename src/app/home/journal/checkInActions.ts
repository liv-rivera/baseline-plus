"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getRequestSession } from "@/lib/auth-session";
import { clearCheckIn, listCheckInFields, saveCheckIn } from "@/lib/checkIns";
import { validDay } from "@/lib/journal";

export interface CheckInFormState {
  message: string;
  ok: boolean;
  /** Revision after a successful save, so the next save from the same form is not refused as stale. */
  revision?: string;
  cleared?: boolean;
}

/** Collect every active field from the form. Empty inputs clear that field's answer. */
async function readSubmittedAnswers(owner: string, form: FormData) {
  const fields = await listCheckInFields(owner);
  const submitted: Record<string, unknown> = {};
  for (const field of fields) {
    submitted[field.id] =
      field.kind === "notes"
        ? { tags: form.getAll(`tag_${field.id}`).map(String), note: String(form.get(`note_${field.id}`) ?? "") }
        : String(form.get(`field_${field.id}`) ?? "");
  }
  return submitted;
}

export async function submitCheckIn(_: CheckInFormState, form: FormData): Promise<CheckInFormState> {
  const session = await getRequestSession(await headers());
  if (!session || session.user.id !== form.get("owner"))
    return { ok: false, message: "Sign in and reopen this day." };
  const owner = session.user.id;
  const day = String(form.get("date"));
  if (!validDay(day)) return { ok: false, message: "Choose a valid calendar date." };
  const revision = String(form.get("revision") ?? "") || undefined;
  try {
    if (form.get("intent") === "clear") {
      if (!revision) return { ok: false, message: "There is no saved check-in to clear." };
      if (form.get("confirm") !== "yes") return { ok: false, message: "Tick the box to confirm clearing this day." };
      const cleared = await clearCheckIn(owner, day, revision);
      if (!cleared) return { ok: false, message: "This check-in changed in another tab. Reload before clearing." };
      revalidatePath("/home", "layout");
      return { ok: true, cleared: true, message: "Check-in cleared." };
    }
    const result = await saveCheckIn(owner, day, await readSubmittedAnswers(owner, form), revision);
    if (!result.ok) return { ok: false, message: result.message };
    revalidatePath("/home", "layout");
    return { ok: true, revision: result.revision, message: "Saved." };
  } catch {
    return { ok: false, message: "Could not save. Please try again." };
  }
}
