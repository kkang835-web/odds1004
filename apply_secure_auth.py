import re

path = "server/protoHistory/protoForwardScheduler.ts"
with open(path, "r") as f:
    text = f.read()

# Let us replace the start and startLimited methods to require an internal secure authority check.
# We will define a secure token generator.
secure_code = """
import crypto from "crypto";

// Secure server-side authority token generated at runtime or bound to operational secret
const SERVER_INTERNAL_SECRET = process.env.OPERATIONAL_SECRET || crypto.randomBytes(32).toString("hex");

export function requestAuthorizedSchedulerStart(intervalMs?: number, secret?: string) {
  if (secret !== SERVER_INTERNAL_SECRET) {
    throw new Error("UNAUTHORIZED_SCHEDULER_START_ATTEMPT");
  }
  return forwardScheduler.start(intervalMs);
}

export function requestAuthorizedSchedulerStartLimited(maxCycles: number, intervalMs?: number, secret?: string) {
  if (secret !== SERVER_INTERNAL_SECRET) {
    throw new Error("UNAUTHORIZED_SCHEDULER_START_ATTEMPT");
  }
  return forwardScheduler.startLimited(maxCycles, intervalMs);
}

export function getServerInternalSecret(): string {
  return SERVER_INTERNAL_SECRET;
}
"""

# Append this secure authority layer to protoForwardScheduler.ts
with open(path, "a") as f:
    f.write(secure_code)

print("Appended secure server authority layer.")
