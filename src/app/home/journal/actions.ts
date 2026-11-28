"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getRequestSession } from "@/lib/auth-session";
import { changeDay } from "@/lib/journal";

export async function saveDay(_: string, form: FormData) {
  const session = await getRequestSession(await headers());
  if (!session || session.user.id !== form.get("owner"))
    return "Sign in and reopen this day.";
  try {
    const result = await changeDay(session.user.id, form);
    if (result === "Saved.") revalidatePath("/home", "layout");
    return result;
  } catch {
    return "Could not save. Please try again.";
  }
}
