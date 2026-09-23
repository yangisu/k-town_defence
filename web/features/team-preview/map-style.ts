import type { StyleSpecification } from "maplibre-gl";

/**
 * The map draws its own ground.
 *
 * A base map was rendered underneath this one, and the two disagreed about
 * where Korea ends: its coast came from a global provider, ours from Statistics
 * Korea, so a fringe of its land showed past our own shoreline and read as a
 * gap in the country. Everything that base map still contributed was colour —
 * its roads, borders and labels were all hidden, because the only lines worth
 * reading here are the ones this product draws — so it is gone, and the sea is
 * a background under the country's own boundary.
 */
export const SEA_COLOR = "#cfe6f5";

export function koreaMapStyle(): StyleSpecification {
  return {
    version: 8,
    // No tiles to fetch: every shape on this map comes from this repository's
    // own GeoJSON, added once the style loads.
    sources: {},
    layers: [{ id: "sea", type: "background", paint: { "background-color": SEA_COLOR } }],
    glyphs: undefined,
  } as StyleSpecification;
}
