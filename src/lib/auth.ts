import { NextAuthOptions, getServerSession } from "next-auth";
import { encode } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { CUSTOMER_IDLE_TIMEOUT_MS, isPastMaxSession, tokenLifetimeSeconds } from "./session-policy";
import { normalizePhone } from "./customers";

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

        // Staff sign in with an email, customers with their phone number.
        const identifier = credentials.email.trim();
        const phone = normalizePhone(identifier);
        const user = await prisma.user.findFirst({
          where: identifier.includes("@") ? { email: identifier } : phone ? { phone } : { email: identifier },
          include: { barber: true },
        });

        if (!user) return null;

        const passwordValid = await bcrypt.compare(
          credentials.password,
          user.password
        );
        if (!passwordValid) return null;

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

export const getSession = () => getServerSession(authOptions);

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
