import { GeneratedReport } from "@/types";

const KEY = "icesight_history";
const MAX = 50;

export function saveToHistory(report: GeneratedReport): void {
  if (typeof window === "undefined") return;
  const history = getHistory();
  const updated = [report, ...history.filter((r) => r.id !== report.id)].slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(updated));
}

export function getHistory(): GeneratedReport[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as GeneratedReport[];
  } catch {
    return [];
  }
}

export function deleteFromHistory(id: string): void {
  if (typeof window === "undefined") return;
  const updated = getHistory().filter((r) => r.id !== id);
  localStorage.setItem(KEY, JSON.stringify(updated));
}

export function clearHistory(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}

export function getReportById(id: string): GeneratedReport | null {
  return getHistory().find((r) => r.id === id) ?? null;
}
