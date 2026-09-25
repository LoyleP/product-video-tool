import { MICROS_PER_SECOND, type Micros } from "@/engine/time";

/** Formats a time as m:ss.cc (or h:mm:ss.cc past an hour) for display. */
export function formatTime(t: Micros): string {
  const totalCs = Math.floor(Math.max(0, t) / (MICROS_PER_SECOND / 100));
  const cs = totalCs % 100;
  const totalS = Math.floor(totalCs / 100);
  const s = totalS % 60;
  const totalM = Math.floor(totalS / 60);
  const m = totalM % 60;
  const h = Math.floor(totalM / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}.${pad(cs)}` : `${m}:${pad(s)}.${pad(cs)}`;
}
