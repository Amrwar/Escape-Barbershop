export { default } from "next-auth/middleware";

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
  ],
};
