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

export function formatDecision(value?: string) {
  if (value === "Yes") return "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-100";
  if (value === "Conditional") return "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100";
  if (value === "No") return "border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-400/25 dark:bg-rose-400/10 dark:text-rose-100";
  return "border-slate-300 bg-slate-50 text-slate-900 dark:border-white/15 dark:bg-white/[0.08] dark:text-slate-100";
}

export function decisionLabel(value?: string) {
  if (value === "Yes") return "Allowed";
  if (value === "Conditional") return "Conditional";
  if (value === "No") return "Not Allowed";
  return "Needs Review";
}

export function formatFileSize(bytes?: number | null) {
  if (!bytes) return "File size unavailable";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(value?: string | null) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function truncateMiddle(value: string, max = 48) {
  if (value.length <= max) return value;
  const left = Math.ceil((max - 3) / 2);
  const right = Math.floor((max - 3) / 2);
  return `${value.slice(0, left)}...${value.slice(value.length - right)}`;
}
