import { expect, test } from "bun:test";
import {
  inspectFreeShutterstockSubscriptions,
  freeShutterstockSubscriptionStatus,
} from "./shutterstock-preflight";
const now = 1_800_000_000_000;
const free = {
  id: "synthetic_free",
  license: "platform",
  asset_type: "images",
  expiration_time: new Date(now + 86400000).toISOString(),
  product_description: "Free API Test Images",
  allotment: { downloads_left: 5, downloads_limit: 500 },
  formats: [{ media_type: "image", format: "jpg", size: "medium" }],
  price_per_download: { local_amount: 0, local_currency: "USD" },
};
test("preflight distinguishes a missing subscription from invalid free metadata or malformed responses", () => {
  expect(freeShutterstockSubscriptionStatus({ data: [] }, now)).toBe(
    "subscription_required",
  );
  expect(
    freeShutterstockSubscriptionStatus(
      { data: [{ ...free, price_per_download: undefined }] },
      now,
    ),
  ).toBe("free_subscription_unverified");
  expect(freeShutterstockSubscriptionStatus({}, now)).toBe(
    "source_unavailable",
  );
  expect(freeShutterstockSubscriptionStatus({ data: [free] }, now)).toBe(
    "free_subscription_verified",
  );
});
test("preflight selects only a fully verified free subscription without licensing", () => {
  expect(
    inspectFreeShutterstockSubscriptions(
      {
        data: [
          { ...free, id: "synthetic_paid", product_description: "Annual API" },
          free,
        ],
      },
      now,
    ),
  ).toEqual([free.id]);
});
test("preflight never infers zero price or remaining quota from missing or malformed metadata", () => {
  for (const patch of [
    { price_per_download: undefined },
    { price_per_download: { local_amount: 1, local_currency: "USD" } },
    { allotment: { downloads_left: 0, downloads_limit: 500 } },
    { license: "standard" },
    { expiration_time: "invalid" },
    { id: "../unsafe" },
  ])
    expect(
      inspectFreeShutterstockSubscriptions(
        { data: [{ ...free, ...patch }] },
        now,
      ),
    ).toEqual([]);
  expect(inspectFreeShutterstockSubscriptions(null, now)).toEqual([]);
});
