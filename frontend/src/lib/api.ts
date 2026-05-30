import type { AskResponse, Authority, DocumentRecord, HistoryItem, Language, SourceReference, WizardContext } from "@/lib/types";

const configuredApiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "").trim();

export const API_BASE_URL = configuredApiBaseUrl.replace(/\/+$/, "");

if (!API_BASE_URL) {
  console.warn(
    "BuildWise AI API URL is not configured. Set NEXT_PUBLIC_API_BASE_URL or NEXT_PUBLIC_API_URL.",
  );
}

function apiUrl(path: string) {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function askBuildWise(payload: {
  query: string;
  language: Language;
  session_id?: string;
  context?: WizardContext;
}) {
  return request<AskResponse>("/ask", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getAuthorities() {
  return request<Authority[]>("/authorities", { cache: "no-store" });
}

export async function getDocuments() {
  return request<DocumentRecord[]>("/documents", { cache: "no-store" });
}

export async function getHistory() {
  return request<HistoryItem[]>("/history", { cache: "no-store" });
}

export async function searchDocuments(payload: {
  query: string;
  authority_id?: string;
  city?: string;
  state?: string;
  document_type?: string;
  top_k?: number;
}) {
  return request<{ results: SourceReference[] }>("/search", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function sendFeedback(payload: { query_id: string; rating?: number; label?: string; comment?: string }) {
  return request("/feedback", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function uploadDocument(form: FormData, adminKey: string) {
  const response = await fetch(apiUrl("/documents"), {
    method: "POST",
    headers: {
      "X-Admin-Api-Key": adminKey,
    },
    body: form,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Upload failed: ${response.status}`);
  }
  return response.json() as Promise<{ chunks_indexed: number; document: DocumentRecord; message: string }>;
}
