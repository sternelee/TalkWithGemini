import { cookies } from "next/headers";
import AccessPasswordPage from "@/components/app/AccessPasswordPage";
import ChatApp from "@/components/app/ChatApp";
import {
  ACCESS_ATTEMPTS_COOKIE,
  ACCESS_SESSION_COOKIE,
  getAccessAttemptState,
  isAccessLocked,
  isAccessPasswordEnabled,
  isValidAccessSessionCookie,
} from "@/lib/security/accessControl";

export default async function Page() {
  if (!isAccessPasswordEnabled()) {
    return <ChatApp />;
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ACCESS_SESSION_COOKIE)?.value;
  if (await isValidAccessSessionCookie(sessionCookie)) {
    return <ChatApp />;
  }

  const attemptState = await getAccessAttemptState(
    cookieStore.get(ACCESS_ATTEMPTS_COOKIE)?.value,
  );

  if (isAccessLocked(attemptState)) {
    return <AccessPasswordPage initialLockedUntil={attemptState.lockedUntil} />;
  }

  return <AccessPasswordPage />;
}
