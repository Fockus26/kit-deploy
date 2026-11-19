// Enrols A (EMAIL_TEST: 2 passkeys + TOTP) and B (qa-b@example.test: 1 passkey + TOTP).
import { enrol, env, launch, sql } from "./lib.mjs";

const A = env("EMAIL_TEST").toLowerCase();
const B = "qa-b@example.test";
const browser = await launch();
try {
  await enrol(browser, A); // passkey 1 + TOTP
  await enrol(browser, A); // passkey 2 (TOTP already on)
  await enrol(browser, B);
  console.log("users:\n" + sql("select (email = (select email from auth_user order by created_at limit 1))::text, two_factor_enabled, (select count(*) from auth_passkey p where p.user_id = u.id) from auth_user u order by created_at"));
} finally {
  await browser.close();
}
