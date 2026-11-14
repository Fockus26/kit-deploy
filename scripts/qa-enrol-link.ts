/**
 * QA only: an enrolment link for the local QA database, like `kit-deploy user create|enrol`
 * does on the VPS. Refuses any database that is not on this machine.
 *
 *   DATABASE_URL=postgresql://…@127.0.0.1:<port>/qa_<port> bun scripts/qa-enrol-link.ts <email> <origin>
 *   → writes the link to .qa/enrol-link.txt (gitignored), never to the console
 */
import { mkdirSync, writeFileSync } from "node:fs";
import {
  ENROL_LINK_TTL_MS,
  generateEnrolmentToken,
} from "../lib/auth/enrolment";
import { AdminError } from "../lib/db/admin";
import { db } from "../lib/db/store";
import { drizzleUserStore } from "../lib/db/users";

const [email, origin] = process.argv.slice(2);
const url = process.env.DATABASE_URL ?? "";
if (!email || !origin) {
  console.error("usage: bun scripts/qa-enrol-link.ts <email> <origin>");
  process.exit(2);
}
if (!/@(127\.0\.0\.1|localhost):\d+\/qa_\d+$/.test(url)) {
  console.error("refused: DATABASE_URL is not a local qa_<port> database");
  process.exit(2);
}

const database = db();
const users = drizzleUserStore(database);
const { token, hash } = generateEnrolmentToken();
const expiresAt = new Date(Date.now() + ENROL_LINK_TTL_MS);
try {
  await users.createUser(email.toLowerCase(), hash, expiresAt);
} catch (e) {
  if (!(e instanceof AdminError)) throw e;
  await users.issueEnrolment(email.toLowerCase(), hash, expiresAt);
}
mkdirSync(".qa", { recursive: true });
writeFileSync(".qa/enrol-link.txt", `${origin}/enrol#${token}\n`);
console.log("enrolment link written to .qa/enrol-link.txt");
await database.$client.end();
