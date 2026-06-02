import { getSession } from "./session";

export interface AccessResult {
  hasAccess: boolean;
  reason: string;
}

export async function fetchAccess(): Promise<AccessResult> {
  const session = getSession();
  if (!session) return { hasAccess: false, reason: "not_logged_in" };

  const role = session.role ?? "";

  // Admin and paid always have access
  if (["admin", "paid", "free"].includes(role)) {
    return { hasAccess: true, reason: "admin" };
  }

  // Trial — check via API
  try {
    const res = await fetch(`/api/auth/access/${session.id}`);
    if (!res.ok) return { hasAccess: false, reason: "error" };
    return await res.json();
  } catch {
    return { hasAccess: false, reason: "error" };
  }
}
