"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getRequestSession } from "@/lib/auth-session";
import { deleteAllRecords } from "@/lib/deleteAllData";

export type DeleteAllDataState = { ok: boolean; message: string };

export async function deleteAllData(
  _: DeleteAllDataState,
  form: FormData,
): Promise<DeleteAllDataState> {
  const session = await getRequestSession(await headers());
  if (!session || session.user.id !== form.get("owner"))
    return { ok: false, message: "Sign in again and reopen settings." };
  if (form.get("confirm") !== "DELETE")
    return { ok: false, message: "Type DELETE to confirm." };
  try {
    const { days } = await deleteAllRecords(session.user.id);
    revalidatePath("/home", "layout");
    return {
      ok: true,
      message:
        days === 1
          ? "Deleted 1 day of records and all check-ins. Your account is still here."
          : `Deleted ${days} days of records and all check-ins. Your account is still here.`,
    };
  } catch {
    console.error("Unable to delete account records.");
    return { ok: false, message: "Nothing was deleted. Please try again." };
  }
}
