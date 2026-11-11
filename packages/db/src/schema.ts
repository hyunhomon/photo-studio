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
