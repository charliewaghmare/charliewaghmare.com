import { randomBytes, scryptSync } from "node:crypto";

const pin = process.env.JOBS_EDIT_PIN ?? "";
if (!/^\d{4}$/.test(pin)) {
  console.error("Set JOBS_EDIT_PIN to the 4-digit PIN in the environment, then rerun.");
  process.exit(1);
}

const salt = randomBytes(16).toString("base64url");
const key = scryptSync(pin, salt, 32, { N: 16384, r: 8, p: 1 });
process.stdout.write(`scrypt$16384$8$1$${salt}$${key.toString("base64url")}\n`);
