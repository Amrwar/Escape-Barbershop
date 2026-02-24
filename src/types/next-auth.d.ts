import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    role: string;
    barberId?: string;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      barberId?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string;
    barberId?: string;
  }
}
