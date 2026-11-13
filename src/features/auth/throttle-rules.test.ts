import { describe, expect, it } from "vitest";
import { clientIp, isOverLimit, THROTTLE_LIMITS, throttleKeys } from "./throttle-rules";

const headers = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null });

describe("throttleKeys", () => {
  it("gives one key per IP and one per email, with the action's limits", () => {
    expect(throttleKeys("signIn", "iph", "emh")).toEqual([
      { key: "signIn:ip:iph", limit: THROTTLE_LIMITS.signIn.ip },
      { key: "signIn:email:emh", limit: THROTTLE_LIMITS.signIn.email },
    ]);
    expect(throttleKeys("reset", "iph", "emh")[1]).toEqual({ key: "reset:email:emh", limit: THROTTLE_LIMITS.reset.email });
  });
});

describe("isOverLimit", () => {
  const keys = throttleKeys("signIn", "iph", "emh");

  it("allows while every key is under its limit (unknown keys count 0)", () => {
    expect(isOverLimit(keys, [])).toBe(false);
    expect(isOverLimit(keys, [{ key: "signIn:email:emh", attempts: THROTTLE_LIMITS.signIn.email - 1 }])).toBe(false);
  });

  it("blocks as soon as one key reaches its limit", () => {
    expect(isOverLimit(keys, [{ key: "signIn:email:emh", attempts: THROTTLE_LIMITS.signIn.email }])).toBe(true);
    expect(isOverLimit(keys, [{ key: "signIn:ip:iph", attempts: THROTTLE_LIMITS.signIn.ip }])).toBe(true);
  });

  it("ignores counts of other keys", () => {
    expect(isOverLimit(keys, [{ key: "reset:email:emh", attempts: 999 }])).toBe(false);
  });
});

describe("clientIp", () => {
  it("prefers x-real-ip, then the first x-forwarded-for entry", () => {
    expect(clientIp(headers({ "x-real-ip": " 1.2.3.4 ", "x-forwarded-for": "5.6.7.8" }))).toBe("1.2.3.4");
    expect(clientIp(headers({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" }))).toBe("5.6.7.8");
  });

  it("falls back to 'unknown'", () => {
    expect(clientIp(headers({}))).toBe("unknown");
  });
});
