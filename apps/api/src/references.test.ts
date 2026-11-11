import { expect, test, spyOn } from "bun:test";
import { studioFixture } from "../test/studio";
import { referenceForm } from "../test/references";
import type { ProductDto } from "@photo-studio/schemas";
import { sourceSnapshot } from "./pipeline";

test("private role references require consent, stay out of garment analysis and never start AI; ownership and one-per-role are enforced", async () => {
  const s = await studioFixture(),
    path = `/products/${s.product.id}/references`;
  expect(
    (await s.call(path, "POST", referenceForm("person_reference", false)))
      .status,
  ).toBe(400);
  expect(
    (
      await s.call(
        path,
        "POST",
        referenceForm("person_reference", true, new Uint8Array([1, 2, 3])),
      )
    ).status,
  ).toBe(400);
  const [a, b] = await Promise.all([
    s.call<ProductDto>(path, "POST", referenceForm()),
    s.call<ProductDto>(path, "POST", referenceForm()),
  ]);
  expect([a.status, b.status].sort()).toEqual([201, 409]);
  const person = (a.status === 201 ? a : b).data.assets.find(
    (v) => v.kind === "person_reference",
  );
  if (!person) throw Error("Missing synthetic reference");
  const look = await s.call<ProductDto>(
    path,
    "POST",
    referenceForm("look_reference"),
  );
  expect(look.status).toBe(201);
  expect(
    look.data.assets.filter((v) => v.kind.endsWith("_reference")),
  ).toHaveLength(2);
  const owner = s.sqlite
    .query("SELECT user_id FROM products WHERE id=?")
    .get(s.product.id) as { user_id: string };
  expect(await sourceSnapshot(s.env, owner.user_id, s.product.id)).toHaveLength(
    1,
  );
  expect(
    s.sqlite.query("SELECT count(*) n FROM generation_jobs").get(),
  ).toEqual({ n: 0 });
  expect(s.objects.size).toBe(3);
  const stranger = await s.login();
  expect(
    (await s.call(path, "POST", referenceForm("look_reference"), stranger))
      .status,
  ).toBe(404);
  const image = await s.app.request(
    `/api/v1/assets/${person.id}/content`,
    { headers: stranger },
    s.env,
  );
  expect(image.status).toBe(404);
  expect(
    (await s.call(`/assets/${person.id}`, "DELETE", undefined, stranger))
      .status,
  ).toBe(404);
  expect((await s.call(`/assets/${person.id}`, "DELETE")).status).toBe(200);
  expect(s.objects.size).toBe(2);
});
test("failed reference storage rolls back metadata and private media", async () => {
  const s = await studioFixture();
  const broken = spyOn(s.env.ASSETS, "put").mockRejectedValue(
    new Error("Synthetic storage failure"),
  );
  const failed = await s.call(
    `/products/${s.product.id}/references`,
    "POST",
    referenceForm(),
  );
  broken.mockRestore();
  expect(failed.status).toBe(500);
  expect(
    s.sqlite
      .query("SELECT count(*) n FROM assets WHERE kind='person_reference'")
      .get(),
  ).toEqual({ n: 0 });
  expect(s.objects.size).toBe(1);
});
