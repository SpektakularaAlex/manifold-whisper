export const API_BASE_URL =
  ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/+$/, "") ||
  (import.meta.env.DEV ? "http://localhost:8000" : "");

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function apiErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
  const detail = typeof body?.detail === "string" ? body.detail : null;
  if (detail) return detail;
  if (response.status === 404) {
    return `${fallback} The trajectory API endpoint returned 404. Check that the backend deployment includes /trajectory.`;
  }
  return `${fallback} Request failed with status ${response.status}.`;
}
