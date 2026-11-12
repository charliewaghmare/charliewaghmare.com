import assert from "node:assert/strict";
import test from "node:test";
import {
  hashPin,
  lockoutDecision,
  readSessionExpiry,
  signSession,
  verifyPin,
} from "./security.ts";

test("pin hash verifies the same pin and rejects another", () => {
  const encoded = hashPin("4821");
  assert.equal(verifyPin("4821", encoded), true);
  assert.equal(verifyPin("4822", encoded), false);
  assert.equal(verifyPin("4821", "plain-pin"), false);
  assert.equal(verifyPin("4821", "scrypt$1024$8$1$salt$key"), false);
});

test("session token expires and rejects tampering", () => {
  const secret = "test-session-secret";
  const now = Date.parse("2026-11-12T12:00:00Z");
  const token = signSession(secret, now);
  assert.ok(readSessionExpiry(token, secret, now + 1000));
  assert.equal(readSessionExpiry(token, secret, now + 8 * 24 * 60 * 60 * 1000), null);
  assert.equal(readSessionExpiry(token, "other-secret", now + 1000), null);
  const [payload] = token.split(".");
  assert.equal(readSessionExpiry(`${payload}.abcd`, secret, now + 1000), null);
});

test("lockout uses ip and global failure counts", () => {
  assert.deepEqual(lockoutDecision({ ipFailures: 4, globalFailures: 4 }), {
    locked: false,
    scope: null,
  });
  assert.equal(lockoutDecision({ ipFailures: 5, globalFailures: 5 }).scope, "ip");
  assert.equal(lockoutDecision({ ipFailures: 0, globalFailures: 20 }).scope, "global");
});
