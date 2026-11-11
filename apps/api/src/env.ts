export interface Env {
  DB: D1Database;
  ASSETS: R2Bucket;
  STUDIO_WORKFLOW: Workflow<{ kind: string; jobId?: string }>;
  APP_ENV: string;
  ENABLE_DEMO: string;
  AI_MODE: string;
  ALLOWED_WEB_ORIGINS: string;
  OPENROUTER_BASE_URL: string;
  OPENROUTER_CALLBACK_URL: string;
  OPENROUTER_IMAGE_MODEL: string;
  OPENROUTER_ANALYSIS_MODEL: string;
  OPENROUTER_EVALUATION_MODEL: string;
  APP_ENCRYPTION_KEY_B64?: string;
  APP_ENCRYPTION_KEY_VERSION: string;
  APP_ENCRYPTION_KEY_PREVIOUS_B64?: string;
  APP_ENCRYPTION_KEY_PREVIOUS_VERSION?: string;
}
export interface Identity {
  userId: string;
  sessionId: string;
  csrf: string;
  isTest: boolean;
  status: string;
}
export type AppContext = { Bindings: Env; Variables: { identity: Identity } };
