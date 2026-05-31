import type { AskResponse, Authority, DocumentRecord, HistoryItem, Language, SourceReference, WizardContext } from "@/lib/types";

const configuredApiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "").trim();

export const API_BASE_URL = configuredApiBaseUrl.replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 45000;

if (!API_BASE_URL) {
  console.warn(
    "BuildWise AI API URL is not configured. Set NEXT_PUBLIC_API_BASE_URL or NEXT_PUBLIC_API_URL.",
  );
}

function apiUrl(path: string) {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export class BuildWiseApiError extends Error {
  status?: number;
  code?: string;
  details?: unknown;

  constructor(message: string, options?: { status?: number; code?: string; details?: unknown }) {
    super(message);
    this.name = "BuildWiseApiError";
    this.status = options?.status;
    this.code = options?.code;
    this.details = options?.details;
  }
}

function assertApiConfigured() {
  if (!API_BASE_URL) {
    throw new BuildWiseApiError("The BuildWise API URL is not configured. Set NEXT_PUBLIC_API_BASE_URL in Vercel.");
  }
}

function timeoutSignal(timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cancel: () => window.clearTimeout(timeout) };
}

async function readErrorMessage(response: Response) {
  const fallback = `The API returned ${response.status}. Please try again.`;
  const contentType = response.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as { message?: string; detail?: string; error?: string; details?: unknown };
      return {
        message: payload.message || payload.detail || fallback,
        code: payload.error,
        details: payload.details,
      };
    }
    const text = await response.text();
    return { message: text || fallback };
  } catch {
    return { message: fallback };
  }
}

function normalizeNetworkError(error: unknown) {
  if (error instanceof BuildWiseApiError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new BuildWiseApiError("The compliance API timed out. Please retry in a moment.");
  }
  if (error instanceof TypeError) {
    return new BuildWiseApiError("Unable to reach the compliance API. Check the backend URL, CORS settings, or Render service status.");
  }
  return error instanceof Error ? error : new BuildWiseApiError("BuildWise AI could not complete the request.");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  assertApiConfigured();
  const timeout = timeoutSignal();
  try {
    const response = await fetch(apiUrl(path), {
      ...init,
      signal: init?.signal || timeout.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    if (!response.ok) {
      const { message, code, details } = await readErrorMessage(response);
      throw new BuildWiseApiError(message, { status: response.status, code, details });
    }
    return response.json() as Promise<T>;
  } catch (error) {
    throw normalizeNetworkError(error);
  } finally {
    timeout.cancel();
  }
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
  assertApiConfigured();
  const timeout = timeoutSignal(90000);
  try {
    const response = await fetch(apiUrl("/documents"), {
      method: "POST",
      signal: timeout.signal,
      headers: {
        "X-Admin-Api-Key": adminKey,
      },
      body: form,
    });
    if (!response.ok) {
      const { message, code, details } = await readErrorMessage(response);
      throw new BuildWiseApiError(message, { status: response.status, code, details });
    }
    return response.json() as Promise<{ chunks_indexed: number; document: DocumentRecord; message: string }>;
  } catch (error) {
    throw normalizeNetworkError(error);
  } finally {
    timeout.cancel();
  }
}
