import "server-only";

import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import {
  APIError,
  createAuthMiddleware,
  getAuthoritativeSessionFromCtx,
} from "better-auth/api";
import { sendAccountEmail } from "@/lib/accountEmail";
import { mayRegister } from "@/lib/betaInvites";
import { getDatabasePool } from "@/lib/database";

const configuredBaseURL =
  process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL;
const baseURL = configuredBaseURL ?? "http://localhost:3000";
const secret = process.env.BETTER_AUTH_SECRET;

if (process.env.NODE_ENV === "production" && (!secret || secret.length < 32)) {
  throw new Error(
    "BETTER_AUTH_SECRET must contain at least 32 characters in production.",
  );
}
if (process.env.NODE_ENV === "production" && !configuredBaseURL) {
  throw new Error("BETTER_AUTH_URL must be configured in production.");
}

export const auth = betterAuth({
  appName: "Baseline",
  baseURL,
  secret: secret ?? "baseline-development-only-secret-change-me",
  database: getDatabasePool(),
  socialProviders:
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            disableSignUp: true,
            includeGrantedScopes: false,
            mapProfileToUser(profile) {
              if (profile.email_verified !== true)
                throw new APIError("FORBIDDEN", {
                  message: "Verify the Google email before linking.",
                });
              return {};
            },
          },
        }
      : {},
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/delete-user") {
        const session = await getAuthoritativeSessionFromCtx(ctx);
        if (
          !session?.user.emailVerified ||
          !ctx.body?.password ||
          ctx.headers?.get("x-baseline-confirm-deletion") !== session.user.id
        ) {
          throw new APIError("FORBIDDEN", {
            message: "Confirm account removal with your current password.",
          });
        }
      }
      if (ctx.path === "/sign-in/social" || ctx.path === "/link-social") {
        if (
          ctx.body?.scopes ||
          ctx.body?.additionalParams ||
          ctx.body?.idToken ||
          ctx.body?.requestSignUp
        ) {
          throw new APIError("BAD_REQUEST", {
            message: "Use the standard Google sign-in flow.",
          });
        }
      }
      if (ctx.path === "/link-social" || ctx.path === "/unlink-account") {
        const session = await getAuthoritativeSessionFromCtx(ctx);
        if (
          !session?.user.emailVerified ||
          Date.now() - session.session.createdAt.getTime() >= 300_000
        ) {
          throw new APIError("FORBIDDEN", {
            message: "Sign in again before changing sign-in methods.",
          });
        }
        if (
          ctx.path === "/unlink-account" &&
          !(
            await ctx.context.internalAdapter.findAccounts(session.user.id)
          ).some(
            (a) => a.id === ctx.body?.accountId && a.providerId === "google",
          )
        ) {
          throw new APIError("FORBIDDEN", {
            message: "Keep the password sign-in method.",
          });
        }
      }
    }),
  },
  user: {
    deleteUser: { enabled: true },
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
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      disableImplicitLinking: true,
      allowDifferentEmails: false,
      allowUnlinkingAll: false,
      trustedProviders: [],
    },
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
    sendResetPassword: ({ user, url }) =>
      sendAccountEmail("reset", user.email, url),
    resetPasswordTokenExpiresIn: 1800,
    revokeSessionsOnPasswordReset: true,
    onExistingUserSignUp: async () => undefined,
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: ({ user, url }) =>
      sendAccountEmail("verify", user.email, url),
  },
  databaseHooks: {
    account: {
      create: {
        before: async (account, ctx) => {
          if (account.providerId !== "google") return;
          const session = ctx && (await getAuthoritativeSessionFromCtx(ctx));
          if (
            !session?.user.emailVerified ||
            session.user.id !== account.userId ||
            Date.now() - session.session.createdAt.getTime() >= 300_000
          ) {
            throw new APIError("FORBIDDEN", {
              message: "Sign in again to link Google.",
            });
          }
        },
      },
    },
    user: {
      create: {
        before: async (user) => {
          const email = user.email.trim().toLowerCase();
          // Invite-only: the owner address and the owner's beta invite list.
          if (!(await mayRegister(email))) {
            throw new APIError("FORBIDDEN", {
              message: "Registration is closed for this address.",
            });
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
