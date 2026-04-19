export function px(x, y) {
  return [y, x];
}

export function getAreaImageSize(area) {
  return area.layers?.imageSize ?? area.imageSize ?? { width: 5200, height: 4000 };
}

export function getAreaBounds(area) {
  const { width, height } = getAreaImageSize(area);
  return [[0, 0], [height, width]];
}

export function normalizeAreas(rawAreas) {
  return Object.fromEntries(
    Object.entries(rawAreas).map(([areaKey, area]) => [
      areaKey,
      {
        ...area,
        pois: (area.pois ?? area).map(poi => ({
          ...poi,
          coords: px(poi.pixelCoords[0], poi.pixelCoords[1]),
        })),
      },
    ]),
  );
}

export function serializePointForJson(point) {
  const name = point.name?.trim();
  const desc = point.desc?.trim();

  return {
    ...(point.id ? { id: point.id } : {}),
    category: point.category,
    subcategory: point.subcategory,
    ...(name ? { name } : {}),
    ...(desc ? { desc } : {}),
    pixelCoords: point.pixelCoords,
  };
}

export function formatPoiJson(payload) {
  return JSON.stringify(payload, null, 2).replace(
    /"pixelCoords": \[\n\s+(-?\d+(?:\.\d+)?),\n\s+(-?\d+(?:\.\d+)?)\n\s+\]/g,
    '"pixelCoords": [$1, $2]',
  );
}

export async function loadAreas() {
  const [areaIndexResponse, categoriesResponse, iconIndexResponse] = await Promise.all([
    fetch('data/regions.json', { cache: 'no-store' }),
    fetch('data/poi-categories.json', { cache: 'no-store' }),
    fetch('assets/icons/index.json', { cache: 'no-store' }),
  ]);

  if (!areaIndexResponse.ok) {
    throw new Error(`Failed to load regions.json (${areaIndexResponse.status})`);
  }
  if (!categoriesResponse.ok) {
    throw new Error(`Failed to load poi-categories.json (${categoriesResponse.status})`);
  }
  if (!iconIndexResponse.ok) {
    throw new Error(`Failed to load assets/icons/index.json (${iconIndexResponse.status})`);
  }

  const [rawAreaIndex, rawCategories, rawIconIndex] = await Promise.all([
    areaIndexResponse.json(),
    categoriesResponse.json(),
    iconIndexResponse.json(),
  ]);

  const areaIndex = rawAreaIndex.regions ?? rawAreaIndex.areas ?? {};
  const pointCategories = rawCategories;
  const availableIcons = rawIconIndex.icons ?? [];

  const areaEntries = await Promise.all(
    Object.entries(areaIndex).map(async ([areaKey, areaMeta]) => {
      const response = await fetch(areaMeta.path, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Failed to load ${areaMeta.path} (${response.status})`);
      }

      const areaData = await response.json();
      return [
        areaKey,
        {
          ...areaMeta,
          pois: areaData,
        },
      ];
    }),
  );

  return {
    areaIndex,
    pointCategories,
    availableIcons,
    areas: normalizeAreas(Object.fromEntries(areaEntries)),
  };
}
