// Shared taxonomy lookup helpers so controllers do not each rescan categories differently.
export function getTypeIndex(pointCategories) {
  return Object.entries(pointCategories).reduce((index, [categoryKey, category], categoryIndex, entries) => {
    index.categoryOrder[categoryKey] = categoryIndex;

    Object.entries(category?.types ?? {}).forEach(([typeKey, type]) => {
      index.types[typeKey] = {
        categoryKey,
        category,
        typeKey,
        type,
      };
    });

    index.categoryCount = entries.length;
    return index;
  }, {
    types: {},
    categoryOrder: {},
    categoryCount: 0,
  });
}

export function getContentTypeMeta(pointCategories, typeKey) {
  return getTypeIndex(pointCategories).types[typeKey] ?? null;
}

export function getCategoryKeyForType(pointCategories, typeKey) {
  return getContentTypeMeta(pointCategories, typeKey)?.categoryKey ?? '';
}

export function getCategoryRenderPriority(pointCategories, categoryKey) {
  // Earlier categories in categories.json should render above later ones.
  const { categoryOrder, categoryCount } = getTypeIndex(pointCategories);
  const categoryIndex = categoryOrder[categoryKey];
  if (categoryIndex === undefined) return 0;

  return (categoryCount - categoryIndex) * 1000;
}
