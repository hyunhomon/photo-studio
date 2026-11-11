import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  index,
  real,
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

export const shootPlans = sqliteTable(
  "shoot_plans",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: text("status").notNull().default("draft"),
    specJson: text("spec_json").notNull(),
    sourceIdsJson: text("source_ids_json").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("plan_owner_product").on(t.userId, t.productId)],
);
export const jobs = sqliteTable(
  "generation_jobs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    stage: text("stage").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    requestJson: text("request_json").notNull(),
    errorCode: text("error_code"),
    createdAt: integer("created_at").notNull(),
    finishedAt: integer("finished_at"),
  },
  (t) => [
    uniqueIndex("job_idempotency").on(t.userId, t.idempotencyKey),
    index("job_owner_product").on(t.userId, t.productId),
  ],
);
export const attempts = sqliteTable(
  "generation_attempts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    model: text("model").notNull(),
    status: text("status").notNull(),
    requestHash: text("request_hash").notNull(),
    promptVersion: text("prompt_version").notNull(),
    providerRequestId: text("provider_request_id"),
    outputJson: text("output_json"),
    durationMs: integer("duration_ms"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    actualCostUsd: real("actual_cost_usd"),
    estimatedCostUsd: real("estimated_cost_usd"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("attempt_job_stage").on(t.jobId, t.stage),
    index("attempt_owner").on(t.userId),
  ],
);

export const evaluations = sqliteTable("quality_evaluations", {
  assetId: text("asset_id")
    .primaryKey()
    .references(() => assets.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  specJson: text("spec_json").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const feedback = sqliteTable(
  "feedback",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    decision: text("decision").notNull(),
    reason: text("reason"),
    note: text("note").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("feedback_asset_owner").on(t.assetId, t.userId, t.createdAt)],
);
