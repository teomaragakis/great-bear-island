// Data loading and normalization for region metadata, POIs, and icon manifests.
export function px(x, y) {
  return [y, x];
}

export function isRegionSelectable(regionMeta) {
  return Boolean(regionMeta && !regionMeta.disabled && regionMeta.path && regionMeta.layers);
}

export function getRegionImageSize(region) {
  return region?.layers?.imageSize ?? region?.imageSize ?? { width: 5200, height: 4000 };
}

export function getRegionBounds(region) {
  const { width, height } = getRegionImageSize(region);
  return [[0, 0], [height, width]];
}

export function normalizeRegions(rawRegions) {
  return Object.fromEntries(
    Object.entries(rawRegions).map(([regionKey, region]) => [
      regionKey,
      {
        ...region,
        pois: (region.pois ?? []).map(poi => ({
          ...normalizeLegacyPoiFields(poi),
          coords: px(poi.pixelCoords[0], poi.pixelCoords[1]),
        })),
      },
    ]),
  );
}

function normalizeLegacyPoiFields(poi) {
  // Accept older saved POIs while keeping the runtime model canonical.
  return {
    ...poi,
    ...(poi.targetRegion !== undefined && poi['target-region'] === undefined
      ? { 'target-region': poi.targetRegion }
      : {}),
  };
}

export function serializePointForJson(point) {
  const name = point.name?.trim();
  const desc = point.desc?.trim();
  const customFields = Object.fromEntries(
    Object.entries(point).filter(([key, value]) => (
      !['id', 'category', 'type', 'name', 'desc', 'pixelCoords', 'coords', 'targetRegion'].includes(key)
      && value !== undefined
      && value !== null
      && value !== ''
    )),
  );

  return {
    ...(point.id ? { id: point.id } : {}),
    category: point.category,
    type: point.type,
    ...(name ? { name } : {}),
    ...(desc ? { desc } : {}),
    ...customFields,
    pixelCoords: point.pixelCoords,
  };
}

export function formatPoiJson(payload) {
  return JSON.stringify(payload, null, 2).replace(
    /"pixelCoords": \[\n\s+(-?\d+(?:\.\d+)?),\n\s+(-?\d+(?:\.\d+)?)\n\s+\]/g,
    '"pixelCoords": [$1, $2]',
  );
}

async function fetchFirstAvailableJson(paths) {
  let lastError = null;

  for (const path of paths) {
    try {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) {
        lastError = new Error(`Failed to load ${path} (${response.status})`);
        continue;
      }

      return {
        path,
        data: await response.json(),
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error(`Failed to load any of: ${paths.join(', ')}`);
}

export async function loadRegions() {
  // Load the three app inputs up front: region index, icon manifest, and taxonomy.
  const [regionIndexResponse, iconIndexResponse, categoriesPayload] = await Promise.all([
    fetch('data/regions.json', { cache: 'no-store' }),
    fetch('assets/icons/index.json', { cache: 'no-store' }),
    fetchFirstAvailableJson(['data/categories.json', 'data/poi-categories.json']),
  ]);

  if (!regionIndexResponse.ok) {
    throw new Error(`Failed to load regions.json (${regionIndexResponse.status})`);
  }
  if (!iconIndexResponse.ok) {
    throw new Error(`Failed to load assets/icons/index.json (${iconIndexResponse.status})`);
  }

  const [rawRegionIndex, rawIconIndex] = await Promise.all([
    regionIndexResponse.json(),
    iconIndexResponse.json(),
  ]);

  const regionIndex = rawRegionIndex.regions ?? rawRegionIndex.areas ?? {};
  const pointCategories = categoriesPayload.data;
  const availableIcons = rawIconIndex.icons ?? [];
  const selectableRegionEntries = Object.entries(regionIndex).filter(([, regionMeta]) => isRegionSelectable(regionMeta));

  const regionEntries = await Promise.all(
    selectableRegionEntries.map(async ([regionKey, regionMeta]) => {
      // Only fetch POI payloads for regions that can actually be selected/rendered.
      const response = await fetch(regionMeta.path, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Failed to load ${regionMeta.path} (${response.status})`);
      }

      const regionData = await response.json();
      return [
        regionKey,
        {
          ...regionMeta,
          pois: regionData,
        },
      ];
    }),
  );

  return {
    regionIndex,
    pointCategories,
    availableIcons,
    regions: normalizeRegions(Object.fromEntries(regionEntries)),
  };
}
