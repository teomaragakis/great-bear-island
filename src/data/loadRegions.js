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
  // Normalize all POIs into the runtime shape once so the rest of the app can stay simple.
  return Object.fromEntries(
    Object.entries(rawRegions).map(([regionKey, region]) => [
      regionKey,
      {
        ...region,
        pois: flattenRegionPois(region.pois ?? []).map((poi, index) => {
          const normalizedPoi = normalizeLegacyPoiFields(poi);
          return {
            ...normalizedPoi,
            id: normalizedPoi.id ?? buildPointId(normalizedPoi, index + 1),
            coords: px(normalizedPoi.pixelCoords[0], normalizedPoi.pixelCoords[1]),
          };
        }),
      },
    ]),
  );
}

function slugifyPointName(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildPointId(point, index) {
  const slug = point?.name?.trim() ? slugifyPointName(point.name) : '';
  if (slug) return slug;
  return `poi-${String(index).padStart(4, '0')}`;
}

export function flattenRegionPois(regionPois) {
  if (Array.isArray(regionPois)) {
    return regionPois;
  }

  // Older region files store POIs grouped by category/type; flatten them into point records.
  return Object.entries(regionPois ?? {}).flatMap(([categoryKey, typeGroups]) => (
    Object.entries(typeGroups ?? {}).flatMap(([typeKey, pois]) => (
      (pois ?? []).map(poi => ({
        ...poi,
        category: categoryKey,
        type: typeKey,
      }))
    ))
  ));
}

function normalizeLegacyPoiFields(poi) {
  // Accept older saved POIs while keeping the runtime model canonical.
  return {
    ...poi,
    ...(poi.transition === undefined && poi['target-region'] !== undefined
      ? { transition: poi['target-region'] }
      : {}),
    ...(poi.transition === undefined && poi.targetRegion !== undefined
      ? { transition: poi.targetRegion }
      : {}),
  };
}

export function serializePointForJson(point) {
  // Strip runtime-only fields and omit blank editor values before export/save.
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

export function groupPoisForJson(points) {
  const usedIds = new Set();

  function getUniquePointId(point, index) {
    // Export should be stable even if the current dataset contains duplicate or missing ids.
    const baseId = point.id ?? buildPointId(point, index);
    if (!usedIds.has(baseId)) {
      usedIds.add(baseId);
      return baseId;
    }

    let suffix = 2;
    let candidate = `${baseId}-${suffix}`;
    while (usedIds.has(candidate)) {
      suffix += 1;
      candidate = `${baseId}-${suffix}`;
    }
    usedIds.add(candidate);
    return candidate;
  }

  return points.reduce((groups, point, index) => {
    const serializedPoint = serializePointForJson({
      ...point,
      id: getUniquePointId(point, index + 1),
    });
    const { category, type, ...storedPoint } = serializedPoint;

    if (!groups[category]) groups[category] = {};
    if (!groups[category][type]) groups[category][type] = [];
    groups[category][type].push(storedPoint);
    return groups;
  }, {});
}

export function formatPoiJson(payload) {
  // Keep common single-line arrays compact to make generated JSON easier to edit by hand.
  const groupedPayload = Array.isArray(payload) ? groupPoisForJson(payload) : payload;

  return JSON.stringify(groupedPayload, null, 2).replace(
    /"pixelCoords": \[\n\s+(-?\d+(?:\.\d+)?),\n\s+(-?\d+(?:\.\d+)?)\n\s+\]/g,
    '"pixelCoords": [$1, $2]',
  ).replace(
    /"contents": \[\n((?:\s+"[^"]+",?\n)+)\s+\]/g,
    (_, items) => {
      const values = [...items.matchAll(/"[^"]+"/g)].map(match => match[0]);
      return `"contents": [${values.join(', ')}]`;
    },
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
