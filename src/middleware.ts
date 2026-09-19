import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isPastMaxSession } from "@/lib/session-policy";
import { isBarberPath, isPublicCustomerPath, isCustomerPath, isStaffRole } from "@/lib/roles";

/**
 * Two doors into the same building: the shop pages are for staff, the customer
 * app is for customers. The pages are client components, so this is their gate.
 * A token past its cap, or from before logins carried one, counts as signed out.
 */
export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = await getToken({ req });
  const signedIn = !!token && !isPastMaxSession(token.loginAt, Date.now(), token.role);

  const sendTo = (path: string) => {
    const url = req.nextUrl.clone();
    url.pathname = path;
    url.search = `?callbackUrl=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  };

  if (isCustomerPath(pathname)) {
    if (isPublicCustomerPath(pathname)) return NextResponse.next();
    if (!signedIn || token?.role !== "CUSTOMER") return sendTo("/app/login");
    return NextResponse.next();
  }

  // A barber's own screens: their day, their customers, their earnings.
  if (isBarberPath(pathname)) {
    if (!signedIn || token?.role !== "BARBER") return sendTo("/login");
    return NextResponse.next();
  }

  if (!signedIn || !isStaffRole(token?.role)) return sendTo("/login");
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/app/:path*",
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
    "/reviews/:path*",
    "/cut-reports/:path*",
    "/inventory/:path*",
    "/attendance/:path*",
    "/settings/:path*",
    "/account/:path*",
    "/appointments/:path*",
    "/barber/:path*",
    "/queue/:path*",
    "/deposits/:path*",
    "/wall/:path*",
    "/time-off/:path*",
  ],
};
