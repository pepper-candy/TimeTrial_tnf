import { describe, expect, it } from "vitest";
import { toPublic } from "./auth";
import { makeDemoEvent } from "./demo";
import {
  hashPin,
  helperAccess,
  isValidPin,
  masterKeyFromEnv,
  verifyMasterKey,
  verifyPin,
  withHelperPin,
} from "./pin";
import { hydrateEvent } from "./store";

const KEY = "club-owner-master-key-2026";
const env = { ADMIN_MASTER_KEY: KEY };

describe("helper PIN", () => {
  it("hashes consistently and rejects a wrong PIN", () => {
    const hash = hashPin("1234");
    expect(hash).toHaveLength(64);
    expect(verifyPin("1234", hash)).toBe(true);
    expect(verifyPin("1234 ", hash)).toBe(true);
    expect(verifyPin("0000", hash)).toBe(false);
    expect(verifyPin("", hash)).toBe(false);
  });

  it("allows writes when no PIN is set", () => {
    expect(verifyPin("", null)).toBe(true);
    expect(verifyPin("anything", undefined)).toBe(true);
  });

  it("only accepts 4–8 digit PINs the number pad can type", () => {
    expect(isValidPin("1234")).toBe(true);
    expect(isValidPin("12345678")).toBe(true);
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("123456789")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
  });
});

describe("PIN reveal", () => {
  it("keeps the plain PIN next to the hash so Admin can show it again", () => {
    const ev = withHelperPin({ pinHash: null, helperPin: null }, " 4821 ");
    expect(ev.helperPin).toBe("4821");
    expect(verifyPin("4821", ev.pinHash)).toBe(true);
  });

  it("resetting replaces both the hash and the revealable PIN", () => {
    const ev = withHelperPin(withHelperPin({ pinHash: null, helperPin: null }, "1111"), "2222");
    expect(ev.helperPin).toBe("2222");
    expect(verifyPin("1111", ev.pinHash)).toBe(false);
    expect(verifyPin("2222", ev.pinHash)).toBe(true);
  });

  it("never sends the PIN or its hash in public poll payloads", () => {
    const pub = toPublic(makeDemoEvent());
    expect(pub.helperPin).toBeNull();
    expect(pub.pinHash).toBeNull();
    expect(pub.hasPin).toBe(true);
  });

  it("treats events saved before PINs were kept as hash-only (null reveal)", () => {
    const legacy = { ...makeDemoEvent(), helperPin: undefined } as unknown as Parameters<
      typeof hydrateEvent
    >[0];
    const ev = hydrateEvent(legacy);
    expect(ev.helperPin).toBeNull();
    expect(ev.pinHash).toBe(hashPin("1234"));
  });
});

describe("master key", () => {
  it("is off unless ADMIN_MASTER_KEY is set and long enough", () => {
    expect(masterKeyFromEnv({})).toBeNull();
    expect(masterKeyFromEnv({ ADMIN_MASTER_KEY: "   " })).toBeNull();
    expect(masterKeyFromEnv({ ADMIN_MASTER_KEY: "short" })).toBeNull();
    expect(masterKeyFromEnv(env)).toBe(KEY);
    expect(verifyMasterKey(KEY, {})).toBe(false);
  });

  it("matches the exact key only", () => {
    expect(verifyMasterKey(KEY, env)).toBe(true);
    expect(verifyMasterKey(` ${KEY} `, env)).toBe(true);
    expect(verifyMasterKey(KEY.toUpperCase(), env)).toBe(false);
    expect(verifyMasterKey("", env)).toBe(false);
  });

  it("unlocks any event, including a hash-only one with a forgotten PIN", () => {
    const forgotten = { pinHash: hashPin("9876") };
    expect(helperAccess(forgotten, { pin: "0000" }, env)).toBeNull();
    expect(helperAccess(forgotten, { key: KEY }, env)).toBe("master");
    expect(helperAccess(forgotten, { key: KEY }, {})).toBeNull();
    expect(helperAccess(forgotten, { pin: "9876" }, env)).toBe("pin");
    expect(helperAccess({ pinHash: null }, {}, env)).toBe("open");
  });
});
