export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/customers/:path*",
    "/visits/:path*",
    "/services/:path*",
    "/barbers/:path*",
    "/salaries/:path*",
  ],
};
