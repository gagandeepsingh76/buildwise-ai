import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatConfidence(value?: string) {
  if (value === "High") return "bg-emerald-500/15 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300";
  if (value === "Medium") return "bg-amber-500/15 text-amber-700 ring-amber-500/20 dark:text-amber-300";
  return "bg-rose-500/15 text-rose-700 ring-rose-500/20 dark:text-rose-300";
}

export function truncateMiddle(value: string, max = 48) {
  if (value.length <= max) return value;
  const left = Math.ceil((max - 3) / 2);
  const right = Math.floor((max - 3) / 2);
  return `${value.slice(0, left)}...${value.slice(value.length - right)}`;
}
