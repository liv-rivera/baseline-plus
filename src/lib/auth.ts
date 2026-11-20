import "server-only";

import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { sendAccountEmail } from "@/lib/accountEmail";
import { getDatabasePool } from "@/lib/database";

const configuredBaseURL = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL;
const baseURL = configuredBaseURL ?? "http://localhost:3000";
const secret = process.env.BETTER_AUTH_SECRET;

if (process.env.NODE_ENV === "production" && (!secret || secret.length < 32)) {
  throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters in production.");
}
if (process.env.NODE_ENV === "production" && !configuredBaseURL) {
  throw new Error("BETTER_AUTH_URL must be configured in production.");
}

export const auth = betterAuth({
  appName: "Baseline",
  baseURL,
  secret: secret ?? "baseline-development-only-secret-change-me",
  database: getDatabasePool(),
  user: {
    modelName: "users",
    fields: {
      name: "display_name",
      emailVerified: "email_verified",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  session: {
    modelName: "user_sessions",
    fields: {
      userId: "user_id",
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
    },
  },
  account: {
    modelName: "user_accounts",
    fields: {
      accountId: "account_id",
      providerId: "provider_id",
      userId: "user_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  verification: {
    modelName: "auth_verifications",
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  rateLimit: {
    enabled: true,
    customRules: {
      "/send-verification-email": { window: 60, max: 1 },
      "/request-password-reset": { window: 60, max: 1 },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    requireEmailVerification: true,
    sendResetPassword: ({ user, url }) => sendAccountEmail("reset", user.email, url),
    resetPasswordTokenExpiresIn: 1800,
    revokeSessionsOnPasswordReset: true,
    onExistingUserSignUp: async () => undefined,
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: ({ user, url }) => sendAccountEmail("verify", user.email, url),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const email = user.email.trim().toLowerCase();
          if (email !== process.env.BASELINE_OWNER_EMAIL?.trim().toLowerCase()) {
            throw new APIError("FORBIDDEN", { message: "Registration is closed for this address." });
          }
          return { data: { ...user, email, name: user.name.trim() } };
        },
      },
    },
  },
  advanced: {
    database: {
      generateId: () => randomUUID(),
    },
  },
});