import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Phase 3 adds the Supabase session refresh here.
export default createMiddleware(routing);

export const config = {
  // Everything except API routes, the auth callback, Next internals and static files.
  matcher: "/((?!api|auth|trpc|_next|_vercel|.*\\..*).*)",
};
