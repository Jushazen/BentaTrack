// Adds the user's id, role, and session version to NextAuth's session and JWT types.
// sessionVersion is optional because sessions created before it existed don't carry it (read as 0).
import type { DefaultSession } from "next-auth";
import type { Role } from "@/generated/prisma/enums";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { id: string; role: Role; sessionVersion?: number };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    sessionVersion?: number;
  }
}
