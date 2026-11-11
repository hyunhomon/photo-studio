import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  externalId: text("openrouter_user_id").notNull().unique(),
  isTest: integer("is_test", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
  lastLoginAt: integer("last_login_at").notNull(),
});
export const connections = sqliteTable(
  "provider_connections",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    keyEnvelope: text("key_envelope").notNull(),
    linkedAt: integer("linked_at").notNull(),
    revokedAt: integer("revoked_at"),
  },
  (t) => [uniqueIndex("connection_user_provider").on(t.userId, t.provider)],
);
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    csrf: text("csrf").notNull(),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("session_expiry").on(t.expiresAt)],
);
export const invites = sqliteTable("invite_codes", {
  id: text("id").primaryKey(),
  codeHash: text("code_hash").notNull().unique(),
  maxUses: integer("max_uses").notNull(),
  usedCount: integer("used_count").notNull().default(0),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const redemptions = sqliteTable(
  "invite_redemptions",
  {
    id: text("id").primaryKey(),
    inviteId: text("invite_id")
      .notNull()
      .references(() => invites.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    redeemedAt: integer("redeemed_at").notNull(),
  },
  (t) => [uniqueIndex("redemption_user").on(t.userId)],
);
export const oauthFlows = sqliteTable(
  "oauth_flows",
  {
    id: text("id").primaryKey(),
    stateHash: text("state_hash").notNull().unique(),
    browserHash: text("browser_hash").notNull(),
    verifierEnvelope: text("verifier_envelope").notNull(),
    inviteId: text("invite_id").references(() => invites.id),
    initiatingUserId: text("initiating_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("flow_expiry").on(t.expiresAt)],
);
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  hits: integer("hits").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("active"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("project_owner").on(t.userId)],
);
export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status").notNull().default("ready"),
    analysisJson: text("analysis_json"),
    analysisVersion: text("analysis_version"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("product_project_owner").on(t.projectId, t.userId)],
);
export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    jobId: text("job_id"),
    kind: text("kind").notNull(),
    r2Key: text("r2_key").notNull().unique(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("asset_product_owner").on(t.productId, t.userId)],
);
export const presets = sqliteTable(
  "brand_presets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    specJson: text("spec_json").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("preset_owner").on(t.userId)],
);

// Survives parent deletion so interrupted R2 writes/deletes can be reconciled.
export const storageCleanup = sqliteTable("storage_cleanup", {
  key: text("key").primaryKey(),
  expiresAt: integer("expires_at").notNull(),
});
