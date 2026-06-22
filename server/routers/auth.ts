import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "../_core/env";

if (!ENV.cookieSecret) {
  // SECURITY FIX: this used to fall back to a hardcoded default string
  // ("dr-rania-clinic-secret-2026") whenever JWT_SECRET wasn't set. That
  // default was readable in source -- anyone who saw it could forge a
  // valid session token for any user ID. Fail loudly instead of silently
  // signing tokens with a known, guessable secret.
  throw new Error(
    "JWT_SECRET environment variable is not set. Refusing to start with a fallback secret."
  );
}
const JWT_SECRET = new TextEncoder().encode(ENV.cookieSecret);

export async function signToken(userId: number): Promise<string> {
  return new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("365d")
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload.sub ? parseInt(payload.sub, 10) : null;
  } catch {
    return null;
  }
}

export const customAuthRouter = router({
  login: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const result = await db.select().from(users)
        .where(eq(users.email, input.email.toLowerCase().trim()))
        .limit(1);

      const user = result[0];
      if (!user || !user.passwordHash) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }

      if (!user.isActive) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Account is deactivated. Contact the clinic admin." });
      }

      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }

      // Update lastSignedIn
      await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));

      const token = await signToken(user.id);
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 365 * 24 * 60 * 60 * 1000 });

      return {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      };
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),

  me: publicProcedure.query(async ({ ctx }) => {
    return ctx.user ?? null;
  }),

  // Admin-only: create a new staff account
  createStaff: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(8, "Password must be at least 8 characters"),
      role: z.enum(["doctor", "assistant", "admin"]),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "doctor" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the doctor can create staff accounts." });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const existing = await db.select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email.toLowerCase().trim()))
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists." });
      }

      const passwordHash = await bcrypt.hash(input.password, 12);
      const openId = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      await db.insert(users).values({
        openId,
        name: input.name,
        email: input.email.toLowerCase().trim(),
        passwordHash,
        loginMethod: "password",
        role: input.role,
        lastSignedIn: new Date(),
      });

      return { success: true };
    }),

  // Admin-only: change a staff member's password
  getProfile: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const result = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const u = result[0];
      if (!u) return null;
      const { passwordHash: _, ...safe } = u;
      return safe;
    }),

  updateProfile: protectedProcedure
    .input(z.object({
      name: z.string().optional(),
      title: z.string().optional(),
      specialty: z.string().optional(),
      dateOfBirth: z.string().optional(),
      address: z.string().optional(),
      country: z.string().optional(),
      emirate: z.string().optional(),
      mobileNumber: z.string().optional(),
      telegramChatId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const update: Record<string, string | null> = {};
      if (input.name !== undefined) update.name = input.name;
      if (input.title !== undefined) update.title = input.title || null;
      if (input.specialty !== undefined) update.specialty = input.specialty || null;
      if (input.dateOfBirth !== undefined) update.dateOfBirth = input.dateOfBirth || null;
      if (input.address !== undefined) update.address = input.address || null;
      if (input.country !== undefined) update.country = input.country || null;
      if (input.emirate !== undefined) update.emirate = input.emirate || null;
      if (input.mobileNumber !== undefined) update.mobileNumber = input.mobileNumber || null;
      if (input.telegramChatId !== undefined) update.telegramChatId = input.telegramChatId || null;
      await db.update(users).set(update).where(eq(users.id, ctx.user.id));
      return { success: true };
    }),

  changePassword: protectedProcedure
    .input(z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const result = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const user = result[0];
      if (!user?.passwordHash) throw new TRPCError({ code: "BAD_REQUEST", message: "No password set on this account." });

      const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect." });

      const newHash = await bcrypt.hash(input.newPassword, 12);
      await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, ctx.user.id));

      return { success: true };
    }),
});
