import { syntheticPng } from "./png";
export function referenceForm(
  role = "person_reference",
  rights = true,
  bytes = syntheticPng(32, 48),
) {
  const form = new FormData();
  form.set("role", role);
  form.set("rightsConfirmed", String(rights));
  form.set(
    "image",
    new File([new Uint8Array(bytes).buffer], "synthetic-reference.png", {
      type: "image/png",
    }),
  );
  return form;
}
