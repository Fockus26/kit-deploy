/**
 * One TOTP guard for every panel action confirmed with a fresh code (D055, D067, D069): the
 * tries per user and the spent codes are shared, so a code that confirmed one action cannot
 * confirm another, and the limit is not multiplied by the number of actions. Server only.
 */
import { memoryTotpGuard } from "@/lib/auth/totp-check";

export const panelTotpGuard = memoryTotpGuard();
