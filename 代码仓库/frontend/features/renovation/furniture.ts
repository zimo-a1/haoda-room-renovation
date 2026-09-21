import catalog from "./furniture-catalog.json";
import type { Element, FurnitureChoice, FurnitureOption } from "./types";

// Local AI concept imagery, not a real SKU catalog or a purchase offer.
// Send option IDs to the backend, which resolves and crops this same trusted catalog.
const groups: Record<string, { image: string; options: { id: string; name: string; panel: number }[] }> = catalog;

export function furnitureOptions(elementId: string): FurnitureOption[] {
  const group = Object.hasOwn(groups, elementId) ? groups[elementId] : undefined;
  return group ? group.options.map((option) => ({ ...option, image: group.image })) : [];
}

export function resolveFurnitureChoices(elements: Element[], selections: Record<string, string>): FurnitureChoice[] {
  return elements.flatMap((element) => {
    const option = furnitureOptions(element.id).find((item) => item.id === selections[element.id]);
    return option ? [{ element, option }] : [];
  });
}
