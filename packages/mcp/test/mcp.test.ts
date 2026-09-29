import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Vault } from "@mycore/core";

const fast = { fastKdf: true };
let dir: string, vaultPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mycore-mcp-"));
  vaultPath = join(dir, "test.mycore");
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("MCP server prerequisites", () => {
  it("can create a vault with passport for MCP testing", async () => {
    const { vault } = await Vault.create(vaultPath, "testpass123", fast);
    
    // Create a passport for MCP access
    const passport = vault.createPassport({
      label: "MCP Test",
      scopes: {
        types: ["memory", "profile", "person", "event"],
        maxSensitivity: "personal",
        read: true,
        write: true,
      },
    });

    expect(passport.id).toBeDefined();
    expect(passport.label).toBe("MCP Test");
    expect(passport.scopes.read).toBe(true);
    expect(passport.scopes.write).toBe(true);

    // Verify passport validation
    expect(vault.validatePassport(passport.id)).toBe(true);

    // Add some test data
    vault.add({ type: "memory", data: { text: "test memory" } });
    vault.add({ type: "profile", data: { key: "name", value: "Test User" } });
    vault.add({ type: "person", data: { name: "Alice", relation: "friend" } });

    // Verify passport restrictions work
    const filter = vault.applyPassport({ type: "memory" }, passport.id);
    expect(filter.type).toBe("memory");
    expect(filter.maxSensitivity).toBe("personal");

    const results = vault.list(filter);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(r => r.type === "memory")).toBe(true);

    vault.close();
  });

  it("handles passport with write restrictions", async () => {
    const { vault } = await Vault.create(vaultPath, "testpass123", fast);
    
    const passport = vault.createPassport({
      label: "Read Only",
      scopes: {
        types: ["memory"],
        maxSensitivity: "personal",
        read: true,
        write: false,
      },
    });

    expect(passport.scopes.write).toBe(false);

    // The MCP server should check this before allowing writes
    const testPassport = vault.getPassport(passport.id);
    expect(testPassport?.scopes.write).toBe(false);

    vault.close();
  });

  it("handles expired passports", async () => {
    const { vault } = await Vault.create(vaultPath, "testpass123", fast);
    
    const expiredDate = new Date(Date.now() - 1000).toISOString();
    const passport = vault.createPassport({
      label: "Expired",
      scopes: { types: ["memory"] },
      expiresAt: expiredDate,
    });

    expect(vault.validatePassport(passport.id)).toBe(false);

    vault.close();
  });

  it("handles revoked passports", async () => {
    const { vault } = await Vault.create(vaultPath, "testpass123", fast);
    
    const passport = vault.createPassport({
      label: "To Revoke",
      scopes: { types: ["memory"] },
    });

    expect(vault.validatePassport(passport.id)).toBe(true);

    vault.revokePassport(passport.id);
    expect(vault.validatePassport(passport.id)).toBe(false);

    vault.close();
  });

  it("applies sensitivity restrictions correctly", async () => {
    const { vault } = await Vault.create(vaultPath, "testpass123", fast);
    
    // Add data at different sensitivity levels
    vault.add({ type: "memory", data: { text: "public" }, sensitivity: "public" });
    vault.add({ type: "memory", data: { text: "personal" }, sensitivity: "personal" });
    vault.add({ type: "memory", data: { text: "private" }, sensitivity: "private" });
    vault.add({ type: "memory", data: { text: "secret" }, sensitivity: "secret" });

    const passport = vault.createPassport({
      label: "Limited",
      scopes: { types: ["memory"], maxSensitivity: "personal" },
    });

    const filter = vault.applyPassport({ type: "memory" }, passport.id);
    const results = vault.list(filter);

    // Should only return public and personal
    expect(results.length).toBe(2);
    expect(results.every(r => r.sensitivity === "public" || r.sensitivity === "personal")).toBe(true);

    vault.close();
  });
});
