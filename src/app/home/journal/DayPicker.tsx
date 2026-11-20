"use client";
import { useEffect, useRef } from "react";
export function DayPicker({ date }: { date: string }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!date && input.current) {
      const d = new Date();
      input.current.value = [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, "0"),
        String(d.getDate()).padStart(2, "0"),
      ].join("-");
    }
  }, [date]);
  return (
    <form>
      <label>
        Date{" "}
        <input
          ref={input}
          name="date"
          type="date"
          required
          defaultValue={date}
        />
      </label>{" "}
      <button>Open day</button>
    </form>
  );
}
