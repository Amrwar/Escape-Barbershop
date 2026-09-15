import { withAuth } from "next-auth/middleware";
import { isPastMaxSession } from "@/lib/session-policy";

// The pages are client components, so this is their gate. A token past its
// two-hour cap, or from before logins had one, is sent back to the login page.
export default withAuth({
  pages: { signIn: "/login" },
  callbacks: {
    authorized: ({ token }) => !!token && !isPastMaxSession(token.loginAt),
  },
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/customers/:path*",
    "/visits/:path*",
    "/services/:path*",
    "/barbers/:path*",
    "/salaries/:path*",
    "/admin/:path*",
    "/advances/:path*",
    "/warehouse/:path*",
    "/issue-notes/:path*",
    "/expenses/:path*",
    "/cash-drawer/:path*",
    "/reports/:path*",
    "/inventory/:path*",
    "/attendance/:path*",
    "/settings/:path*",
    "/account/:path*",
  ],
};
