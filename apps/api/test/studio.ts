import { createApp } from "../src/app";
import { memoryEnv } from "./memory";
import { syntheticPng } from "./png";
import type { JobDto, ProductDto, ProjectDto } from "@photo-studio/schemas";
export async function studioFixture() {
  const state = memoryEnv(),
    app = createApp();
  async function login() {
    const r = await app.request(
      "/auth/demo",
      { method: "POST", headers: { Origin: "http://localhost:4321" } },
      state.env,
    );
    const b = (await r.json()) as { data: { csrf: string } };
    return {
      Cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "",
      Origin: "http://localhost:4321",
      "X-CSRF-Token": b.data.csrf,
    };
  }
  const headers = await login();
  async function call<T>(
    path: string,
    method = "GET",
    body?: unknown,
    h = headers,
  ) {
    const r = await app.request(
      `/api/v1${path}`,
      {
        method,
        headers: h,
        ...(body === undefined
          ? {}
          : { body: body instanceof FormData ? body : JSON.stringify(body) }),
      },
      state.env,
    );
    return {
      status: r.status,
      ...((await r.json()) as { data: T; error?: { code: string } }),
    };
  }
  const project = (
    await call<ProjectDto>("/projects", "POST", { name: "Synthetic fixture" })
  ).data;
  const form = new FormData();
  form.set("name", "Synthetic garment");
  form.append(
    "images",
    new File([new Uint8Array(syntheticPng()).buffer], "synthetic.png", {
      type: "image/png",
    }),
  );
  const product = (
    await call<ProductDto>(`/projects/${project.id}/products`, "POST", form)
  ).data;
  const planInput = {
    consent: true,
    idempotencyKey: crypto.randomUUID(),
    description: "Synthetic test",
    presetId: null,
  };
  async function startPlan() {
    return (
      await call<JobDto>(`/products/${product.id}/plan`, "POST", planInput)
    ).data;
  }
  return {
    ...state,
    app,
    headers,
    login,
    call,
    project,
    product,
    planInput,
    startPlan,
  };
}
