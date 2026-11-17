import type { ProductDto } from "@photo-studio/schemas";
import type { Env, Identity } from "./env";
import { insertJob, sourceSnapshot, type PlanSnapshot } from "./pipeline";
import { referenceSource } from "./reference-source";
import { AppError } from "./errors";

export async function startQuickShoot(
  env: Env,
  identity: Identity,
  product: ProductDto,
  idempotencyKey: string,
) {
  const evidence = product.assets.filter((a) =>
    ["input", "person_reference", "look_reference"].includes(a.kind),
  );
  if (evidence.reduce((n, a) => n + a.sizeBytes, 0) > 12 * 1024 * 1024)
    throw new AppError(
      "SOURCE_TOO_LARGE",
      "사진 합계는 12MB 이하여야 합니다.",
      409,
    );
  const look = evidence.find((a) => a.kind === "look_reference");
  const person = evidence.find((a) => a.kind === "person_reference");
  const snapshot: PlanSnapshot = {
    autoGenerate: true,
    sourceIds: await sourceSnapshot(env, identity.userId, product.id),
    preset: null,
    description: "",
    analysisModel: identity.isTest
      ? "mock/analyzer-planner-v1"
      : env.OPENROUTER_ANALYSIS_MODEL,
    imageModel: identity.isTest
      ? "mock/reference-copy-v1"
      : env.OPENROUTER_IMAGE_MODEL,
    useAutomaticReference: false,
    lookReferenceId: look?.id ?? null,
    personReferenceId: person?.id ?? null,
    referenceConsent: true,
    referenceSources: [
      ...(look
        ? [
            referenceSource(
              look.id,
              "look_reference",
              look.sourcePinUrl ?? null,
            ),
          ]
        : []),
      ...(person
        ? [
            referenceSource(
              person.id,
              "person_reference",
              person.sourcePinUrl ?? null,
            ),
          ]
        : []),
    ],
  };
  return insertJob(
    env,
    identity.userId,
    product.id,
    "shoot",
    idempotencyKey,
    snapshot,
  );
}
