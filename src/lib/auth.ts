import { NextAuthOptions, getServerSession } from "next-auth";
import { encode } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { CUSTOMER_IDLE_TIMEOUT_MS, isPastMaxSession, tokenLifetimeSeconds } from "./session-policy";
import { normalizePhone } from "./customers";
import { headers } from "next/headers";
import { bearerFrom, sessionFromToken } from "./mobile-token";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    // The longest a token may live; encode() below shortens it per role, so a
    // shop device still expires in 30 minutes while a customer's phone does not.
    maxAge: CUSTOMER_IDLE_TIMEOUT_MS / 1000,
  },
  jwt: {
    // Expiry is baked into the token, so the middleware turns away a login past
    // its cap too, not only the pages that read the session.
    encode: (params) =>
      encode({ ...params, maxAge: tokenLifetimeSeconds(params.token?.loginAt, Date.now(), params.token?.role) }),
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email or phone", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }
        const user = await verifyCredentials(credentials.email, credentials.password);
        if (!user) return null;

        return {
          id: user.id,
          email: user.email ?? "",
          name: user.name,
          role: user.role,
          barberId: user.barberId ?? undefined,
          customerId: user.customerId ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.barberId = user.barberId;
        token.customerId = user.customerId;
        token.loginAt = Date.now();
      }
      // Throwing, not returning null, is what makes NextAuth drop the cookie.
      // Tokens from before this rule have no loginAt and are ended here too.
      if (isPastMaxSession(token.loginAt, Date.now(), token.role)) {
        throw new Error("Session reached its maximum length");
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.sub!;
        session.user.role = token.role as string;
        session.user.barberId = token.barberId as string | undefined;
        session.user.customerId = token.customerId as string | undefined;
        session.loginAt = token.loginAt;
      }
      return session;
    },
  },
};

/**
 * The login behind an email or phone number and a password, or null. Shared by
 * the browser's sign-in and the phone app's, so both refuse the same things.
 */
export async function verifyCredentials(identifier: string, password: string) {
  if (!identifier || !password) return null;

  // Staff sign in with an email, customers with their phone number.
  const typed = identifier.trim();
  const phone = normalizePhone(typed);
  const user = await prisma.user.findFirst({
    where: typed.includes("@") ? { email: typed } : phone ? { phone } : { email: typed },
  });
  if (!user) return null;

  return (await bcrypt.compare(password, user.password)) ? user : null;
}

/** The phone app's bearer token, when there is a request to read it from. */
async function bearerSession() {
  let header: string | null = null;
  try {
    header = headers().get("authorization");
  } catch {
    // Called outside a request — a script, a test — so there is no header.
    return null;
  }
  return sessionFromToken(bearerFrom(header));
}

/**
 * The browser's cookie first, then the phone app's bearer token. Either way the
 * result has the same shape, so no route needs to know which door was used.
 */
export const getSession = async () => (await getServerSession(authOptions)) ?? (await bearerSession());

/**
 * Staff only. Every till and office route hangs off this, so a customer's own
 * login can never reach one however it was obtained.
 */
export async function requireStaff() {
  const session = await getSession();
  if (!session || (session.user.role !== "OWNER" && session.user.role !== "CASHIER")) {
    throw new Error("Unauthorized: Staff access required");
  }
  return session;
}

/** A barber, on their own screens. */
export async function requireBarber() {
  const session = await getSession();
  if (!session || session.user.role !== "BARBER" || !session.user.barberId) {
    throw new Error("Unauthorized: Barber login required");
  }
  return session as typeof session & { user: { barberId: string } };
}

/** A signed-in customer, booking for themselves. */
export async function requireCustomer() {
  const session = await getSession();
  if (!session || session.user.role !== "CUSTOMER" || !session.user.customerId) {
    throw new Error("Unauthorized: Customer login required");
  }
  return session as typeof session & { user: { customerId: string } };
}

export async function requireOwner() {
  const session = await getSession();
  if (!session || session.user.role !== "OWNER") {
    throw new Error("Unauthorized: Owner access required");
  }
  return session;
}

/** Running the till is a floor job: the cashier does it, the owner can too. */
export async function requireOwnerOrCashier() {
  const session = await getSession();
  if (!session || (session.user.role !== "OWNER" && session.user.role !== "CASHIER")) {
    throw new Error("Unauthorized: Owner or cashier access required");
  }
  return session;
}

/**
 * Any member of staff. Named for what the shop screens mean by "signed in";
 * a customer login does not count.
 */
export async function requireAuth() {
  return requireStaff();
}

/**
 * Anybody who works here — the till and the chair both.
 *
 * For records that belong to the shop rather than to one role: a report on a
 * cut can come from the barber who did it or from whoever was at the counter
 * when it went wrong, and either is a legitimate author.
 *
 * Deliberately not `isStaffRole`: that one guards the shop screens, where a
 * barber does not belong. This is about working here, not about the till.
 */
const WORKS_HERE = ["OWNER", "CASHIER", "BARBER"];

export async function requireShopPerson() {
  const session = await getSession();
  if (!session || !WORKS_HERE.includes(String(session.user.role))) {
    throw new Error("Unauthorized: Staff login required");
  }
  return session;
}
