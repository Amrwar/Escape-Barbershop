import { NextAuthOptions, getServerSession } from "next-auth";
import { encode } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { IDLE_TIMEOUT_MS, isPastMaxSession, tokenLifetimeSeconds } from "./session-policy";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    // The token is re-issued each time an active browser checks in, so this is
    // the inactivity limit; the jwt callback and encode below add the hard cap.
    maxAge: IDLE_TIMEOUT_MS / 1000,
  },
  jwt: {
    // Expiry is baked into the token, so the middleware turns away a login past
    // its cap too, not only the pages that read the session.
    encode: (params) => encode({ ...params, maxAge: tokenLifetimeSeconds(params.token?.loginAt) }),
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
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
          email: user.email,
          name: user.name,
          role: user.role,
          barberId: user.barberId ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.barberId = user.barberId;
        token.loginAt = Date.now();
      }
      // Throwing, not returning null, is what makes NextAuth drop the cookie.
      // Tokens from before this rule have no loginAt and are ended here too.
      if (isPastMaxSession(token.loginAt)) {
        throw new Error("Session reached its maximum length");
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.sub!;
        session.user.role = token.role as string;
        session.user.barberId = token.barberId as string | undefined;
        session.loginAt = token.loginAt;
      }
      return session;
    },
  },
};

export const getSession = () => getServerSession(authOptions);

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

export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized: Login required");
  }
  return session;
}
