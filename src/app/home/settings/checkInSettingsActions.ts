"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getRequestSession } from "@/lib/auth-session";
import {
  addCheckInField,
  applyCheckInPreset,
  countFieldAnswers,
  deleteCheckInField,
  listCheckInFields,
  reorderCheckInFields,
  setCheckInFieldRetired,
  setCheckInTime,
  updateCheckInField,
} from "@/lib/checkIns";
import { CHECK_IN_FIELD_KINDS, type CheckInFieldKind } from "@/lib/checkInValues";

export interface ManageState {
  message: string;
  ok: boolean;
}

/** One action for every check-in setting; `op` says which change the form makes. */
export async function manageCheckIn(_: ManageState, form: FormData): Promise<ManageState> {
  const session = await getRequestSession(await headers());
  if (!session || session.user.id !== form.get("owner")) return { ok: false, message: "Sign in again to change settings." };
  const owner = session.user.id;
  const op = String(form.get("op"));
  const fieldId = String(form.get("field") ?? "");
  const done = (message: string): ManageState => {
    revalidatePath("/home", "layout");
    return { ok: true, message };
  };
  try {
    switch (op) {
      case "time": {
        const time = form.get("time");
        if (time !== "morning" && time !== "evening") return { ok: false, message: "Choose morning or evening." };
        await setCheckInTime(owner, time);
        return done(time === "morning" ? "Check-ins now describe last night and today." : "Check-ins now describe the day just finished.");
      }
      case "add": {
        const kind = String(form.get("kind")) as CheckInFieldKind;
        if (!CHECK_IN_FIELD_KINDS.includes(kind) || kind === "notes") return { ok: false, message: "Choose a field type." };
        const result = await addCheckInField(owner, {
          label: String(form.get("label") ?? ""),
          kind,
          unit: kind === "number" ? String(form.get("unit") ?? "") || null : null,
        });
        return result.ok ? done(`Added ${result.field.label}.`) : { ok: false, message: result.message };
      }
      case "rename": {
        const result = await updateCheckInField(owner, fieldId, { label: String(form.get("label") ?? "") });
        return result.ok ? done(`Renamed to ${result.field.label}.`) : { ok: false, message: result.message };
      }
      case "up":
      case "down": {
        const ids = (await listCheckInFields(owner)).map((field) => field.id);
        const at = ids.indexOf(fieldId);
        const to = op === "up" ? at - 1 : at + 1;
        if (at < 0 || to < 0 || to >= ids.length) return { ok: false, message: "That field can't move further." };
        [ids[at], ids[to]] = [ids[to], ids[at]];
        return (await reorderCheckInFields(owner, ids)) ? done("Order saved.") : { ok: false, message: "Reload and try again." };
      }
      case "retire":
      case "restore": {
        const result = await setCheckInFieldRetired(owner, fieldId, op === "retire");
        if (!result.ok) return { ok: false, message: result.message };
        return done(op === "retire" ? `${result.field.label} is hidden. Its history is kept.` : `${result.field.label} is back on the form.`);
      }
      case "delete": {
        const days = await countFieldAnswers(owner, fieldId);
        if (form.get("confirm") !== "yes")
          return { ok: false, message: `Tick the box to delete this field and its answers on ${days} ${days === 1 ? "day" : "days"}.` };
        return (await deleteCheckInField(owner, fieldId))
          ? done("Field and its answers deleted.")
          : { ok: false, message: "Energy, Soreness and Notes can be hidden but not deleted." };
      }
      case "preset": {
        const result = await applyCheckInPreset(owner, String(form.get("preset") ?? ""));
        if (!result.ok) return { ok: false, message: result.message };
        return done(describePreset(result.added, result.restored, result.skipped));
      }
      default:
        return { ok: false, message: "Unknown change." };
    }
  } catch {
    return { ok: false, message: "Could not save. Please try again." };
  }
}

function list(labels: string[]): string {
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

function describePreset(added: string[], restored: string[], skipped: string[]): string {
  const parts: string[] = [];
  if (added.length) parts.push(`Added ${list(added)}.`);
  if (restored.length) parts.push(`Brought back ${list(restored)}.`);
  if (!added.length && !restored.length) return "You already have every field in this set.";
  if (skipped.length) parts.push(`You already had ${list(skipped)}.`);
  return parts.join(" ");
}
