import { expect, test } from "@playwright/test";
import { buildMapEditorHref, listMapCommerceOffers } from "../src/lib/mapCommerceLinks";
import { isValidMapId } from "../src/lib/mapId";

const SAMPLE_MAP_ID = "c1b74e84-3aab-4679-95f8-6d0728d39828";

test.describe("map commerce links", () => {
  test("buildMapEditorHref includes map_id and source", () => {
    const href = buildMapEditorHref(SAMPLE_MAP_ID, { checkout: "print", print_variant: "poster_framed" });
    expect(href).toContain(`map_id=${SAMPLE_MAP_ID}`);
    expect(href).toContain("source=map-hub");
    expect(href).toContain("checkout=print");
    expect(href).toContain("print_variant=poster_framed");
  });

  test("listMapCommerceOffers returns HD, edit, and stable ids", () => {
    const offers = listMapCommerceOffers(SAMPLE_MAP_ID);
    expect(offers.length).toBeGreaterThanOrEqual(2);
    expect(offers.some((offer) => offer.id === "digital-hd")).toBeTruthy();
    expect(offers.some((offer) => offer.id === "edit-design")).toBeTruthy();
    for (const offer of offers) {
      expect(offer.href).toMatch(/^\/editor\?/);
      expect(offer.href).toContain(`map_id=${SAMPLE_MAP_ID}`);
      expect(offer.label.length).toBeGreaterThan(0);
      expect(offer.priceLine.length).toBeGreaterThan(0);
    }
  });

  test("invalid map id yields no offers", () => {
    expect(listMapCommerceOffers("not-a-uuid")).toEqual([]);
    expect(isValidMapId("not-a-uuid")).toBe(false);
  });
});
