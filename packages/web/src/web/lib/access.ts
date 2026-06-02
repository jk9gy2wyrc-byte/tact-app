import { getSession } from "./session";

export interface AccessResult {
  hasAccess: boolean;
  reason: string;
  role?: string;
  trialEndsAt?: string;
  trialEndedAt?: string;
}

export async function fetchAccess(): Promise<AccessResult> {
  const session = getSession();
  if (!session) return { hasAccess: false, reason: "not_logged_in" };

  // Always check API — localStorage role may be stale after admin changes it
  try {
    const res = await fetch(`/api/auth/access/${session.id}`);
    if (!res.ok) return { hasAccess: false, reason: "error" };
    return await res.json();
  } catch {
    return { hasAccess: false, reason: "error" };
  }
}
