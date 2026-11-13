/**
 * kit-deploy's own Better Auth endpoints:
 *
 *   POST /kit/enrol      { token }  redeems an enrolment link → a 30-minute enrolment session
 *   POST /sign-in/totp   { email }  starts a TOTP / recovery-code sign-in (D003: TOTP is the
 *                                   backup of the passkey; there is no password)
 *
 * `/sign-in/totp` opens the same challenge Better Auth's two-factor plugin opens after a
 * password sign-in (its `two_factor` cookie + verification rows), so the code itself is checked
 * by `/two-factor/verify-totp` or `/two-factor/verify-backup-code`, with their per-challenge
 * attempt limit and account lockout.
 */
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import { z } from "zod";
import { hashToken } from "../tokens";
import {
  ENROL_SESSION_TTL_MS,
  ENROL_TOKEN,
  type EnrolmentStore,
} from "./enrolment";

/** Better Auth's two-factor plugin names (better-auth/dist/plugins/two-factor/constant). */
const TWO_FACTOR_COOKIE = "two_factor";
const TWO_FACTOR_CHALLENGE_SECONDS = 600;

export type KitAuthOptions = {
  enrolments: EnrolmentStore;
  now?: () => number;
};

const invalidLink = () =>
  APIError.from("UNAUTHORIZED", {
    message: "invalid or expired enrolment link",
    code: "INVALID_ENROLMENT_LINK",
  });

export const kitAuth = (options: KitAuthOptions) => {
  const now = options.now ?? Date.now;
  return {
    id: "kit-deploy",
    schema: {
      session: {
        fields: {
          // Set only by /kit/enrol (lib/auth/session.ts reads it).
          enrolUntil: { type: "date", required: false, input: false },
        },
      },
    },
    endpoints: {
      redeemEnrolment: createAuthEndpoint(
        "/kit/enrol",
        {
          method: "POST",
          body: z.object({ token: z.string().max(100) }),
        },
        async (ctx) => {
          const { token } = ctx.body;
          if (!ENROL_TOKEN.test(token)) throw invalidLink();
          const t = now();
          const userId = await options.enrolments.redeem(
            hashToken(token),
            new Date(t),
          );
          if (!userId) throw invalidLink();
          const user = await ctx.context.internalAdapter.findUserById(userId);
          if (!user) throw invalidLink();
          const until = new Date(t + ENROL_SESSION_TTL_MS);
          // overrideAll: our expiresAt and enrolUntil win over Better Auth's defaults.
          const session = await ctx.context.internalAdapter.createSession(
            user.id,
            true,
            { enrolUntil: until, expiresAt: until },
            true,
          );
          if (!session)
            throw APIError.from("INTERNAL_SERVER_ERROR", {
              message: "failed to create session",
              code: "FAILED_TO_CREATE_SESSION",
            });
          // dontRememberMe: a browser-session cookie, gone when the browser closes.
          await setSessionCookie(ctx, { session, user }, true);
          return ctx.json({
            email: user.email,
            enrolUntil: until.toISOString(),
          });
        },
      ),

      startTotpSignIn: createAuthEndpoint(
        "/sign-in/totp",
        {
          method: "POST",
          body: z.object({ email: z.string().max(254) }),
        },
        async (ctx) => {
          const email = ctx.body.email.trim().toLowerCase();
          const user = await ctx.context.internalAdapter.findUserByEmail(email);
          const factor = user
            ? await ctx.context.adapter.findOne<{ verified?: boolean | null }>({
                model: "twoFactor",
                where: [{ field: "userId", value: user.user.id }],
              })
            : null;
          // Same answer whether or not the account exists: without a challenge the code is
          // refused by verify-totp like a wrong one.
          if (!user || !factor || factor.verified === false) {
            return ctx.json({ twoFactorRedirect: true });
          }
          const expiresAt = new Date(
            now() + TWO_FACTOR_CHALLENGE_SECONDS * 1000,
          );
          const identifier = `2fa-${generateRandomString(20)}`;
          await ctx.context.internalAdapter.createVerificationValue({
            value: user.user.id,
            identifier,
            expiresAt,
          });
          await ctx.context.internalAdapter.createVerificationValue({
            value: "0",
            identifier: `2fa-attempts-${identifier}`,
            expiresAt,
          });
          const cookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE, {
            maxAge: TWO_FACTOR_CHALLENGE_SECONDS,
          });
          await ctx.setSignedCookie(
            cookie.name,
            identifier,
            ctx.context.secret,
            cookie.attributes,
          );
          return ctx.json({ twoFactorRedirect: true });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
};
