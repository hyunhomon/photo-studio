import { describe, expect, test } from "bun:test";
import {
  objectDeletePath,
  resetFlags,
  resetTables,
  scopedResetTables,
} from "../../../scripts/reset-production-data";

describe("production reset boundaries", () => {
  test("read-only by default and requires both explicit execution switches", () => {
    expect(resetFlags([]).execute).toBe(false);
    expect(resetFlags(["--confirm-photo-studio-reset"]).execute).toBe(false);
    expect(() => resetFlags(["--execute"])).toThrow();
    expect(() => resetFlags(["--database=another-service"])).toThrow();
    expect(
      resetFlags(["--execute", "--confirm-photo-studio-reset"]).execute,
    ).toBe(true);
  });
  test("preserves migration/internal metadata and rejects unfamiliar tables", () => {
    const tables = scopedResetTables([
      ...resetTables,
      "d1_migrations",
      "sqlite_sequence",
      "_cf_METADATA",
    ]);
    expect(tables).toEqual([...resetTables]);
    expect(() =>
      scopedResetTables([...resetTables, "unreviewed_data"]),
    ).toThrow();
    expect(() => scopedResetTables(["users"])).toThrow();
    expect(tables.indexOf("generation_attempts")).toBeLessThan(
      tables.indexOf("generation_jobs"),
    );
    expect(tables.indexOf("products")).toBeLessThan(tables.indexOf("users"));
  });
  test("object deletion is pinned and keeps literal key slashes", () => {
    const account = "a".repeat(32);
    const path = objectDeletePath(account, "private/file name?.webp");
    expect(path).toBe(
      `/accounts/${account}/r2/buckets/photo-studio-production-assets/objects/private/file%20name%3F.webp`,
    );
    expect(objectDeletePath(account, "%2e%2e/file")).toContain(
      "%252e%252e/file",
    );
    for (const key of ["", ".", "..", "folder/../../", "folder/./file"]) {
      expect(() => objectDeletePath(account, key)).toThrow();
    }
    expect(() => objectDeletePath("bad-account", "file")).toThrow();
  });
});
