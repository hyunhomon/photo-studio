import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

test("product-first studio reset removes studio data and project FK while preserving authentication schema and rows", () => {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  const dir = resolve(import.meta.dir, "../migrations");
  for (const file of readdirSync(dir)
    .filter((v) => v.endsWith(".sql") && !v.startsWith("0009"))
    .sort())
    db.exec(readFileSync(resolve(dir, file), "utf8"));
  db.exec(
    "INSERT INTO users(id,openrouter_user_id,created_at,last_login_at) VALUES('synthetic-user','synthetic-external',0,0)",
  );
  db.exec(
    "INSERT INTO provider_connections(id,user_id,provider,key_envelope,linked_at) VALUES('synthetic-connection','synthetic-user','mock','synthetic',0)",
  );
  db.exec(
    "INSERT INTO sessions(id,user_id,token_hash,csrf,expires_at,created_at) VALUES('synthetic-session','synthetic-user','synthetic-hash','synthetic-csrf',1,0)",
  );
  db.exec(
    "INSERT INTO projects(id,user_id,name,created_at,updated_at) VALUES('synthetic-project','synthetic-user','synthetic',0,0)",
  );
  db.exec(
    "INSERT INTO products(id,project_id,user_id,name,created_at) VALUES('synthetic-product','synthetic-project','synthetic-user','synthetic',0)",
  );
  db.exec(
    "INSERT INTO assets(id,user_id,product_id,kind,r2_key,mime_type,size_bytes,width,height,created_at) VALUES('synthetic-asset','synthetic-user','synthetic-product','input','synthetic-key','image/png',1,1,1,0)",
  );
  db.exec(
    "INSERT INTO brand_presets(id,user_id,name,spec_json,updated_at) VALUES('synthetic-preset','synthetic-user','synthetic','{}',0)",
  );
  db.exec(readFileSync(resolve(dir, "0009_hesitant_maelstrom.sql"), "utf8"));
  for (const table of ["users", "provider_connections", "sessions"])
    expect(db.query(`SELECT count(*) n FROM ${table}`).get()).toEqual({ n: 1 });
  for (const table of ["products", "assets", "brand_presets"])
    expect(db.query(`SELECT count(*) n FROM ${table}`).get()).toEqual({ n: 0 });
  expect(
    db
      .query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'",
      )
      .get(),
  ).toBeNull();
  expect(
    (db.query("PRAGMA table_info(products)").all() as { name: string }[]).some(
      (v) => v.name === "project_id",
    ),
  ).toBe(false);
  expect(
    (
      db.query("PRAGMA table_info(shoot_plans)").all() as { name: string }[]
    ).some((v) => v.name === "look_reference_id"),
  ).toBe(true);
  db.exec(
    "INSERT INTO products(id,user_id,name,created_at) VALUES('synthetic-new','synthetic-user','synthetic',0)",
  );
  db.exec(
    "INSERT INTO assets(id,user_id,product_id,kind,r2_key,mime_type,size_bytes,width,height,created_at) VALUES('synthetic-new-asset','synthetic-user','synthetic-new','look_reference','synthetic-new-key','image/png',1,1,1,0)",
  );
  expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  db.exec("DELETE FROM products WHERE id='synthetic-new'");
  expect(db.query("SELECT count(*) n FROM assets").get()).toEqual({ n: 0 });
  db.close();
});
