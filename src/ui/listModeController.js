// List-mode controller: renders all POIs in the current region as a scrollable,
// searchable list grouped by category. Clicking an item flies the map to that POI.
export function createListModeController({
  listEl,
  importantOnly = false,
  groupByType = false,
  getRegions,
  getCurrentRegion,
  getPointCategories,
  getCategoryMeta,
  getPointIcon,
  onPoiSelect,
}) {
  const listEls = Array.isArray(listEl) ? listEl : [listEl];
  let activeSearchTerm = '';

  function isImportant(categoryKey, typeKey) {
    const cat = getCategoryMeta(categoryKey);
    const type = cat?.types?.[typeKey];
    return cat?.important === true || type?.important === true;
  }

  function getDisplayLabel(poi, categoryMeta) {
    if (poi.name) return poi.name;
    return categoryMeta?.types?.[poi.type]?.label ?? poi.type;
  }

  function renderPoiItem(poi, categoryMeta, color) {
    const displayLabel = getDisplayLabel(poi, categoryMeta);
    const typeLabel = categoryMeta?.types?.[poi.type]?.label ?? poi.type;
    const iconUrl = getPointIcon(poi);

    const iconHtml = iconUrl
      ? `<span class="poi-list-icon icon-asset icon-asset-mask" style="--icon-url: url(${iconUrl})"></span>`
      : `<span class="poi-list-dot" style="--category-color: ${color}"></span>`;

    const typeTag = poi.name
      ? `<span class="poi-list-type">${typeLabel}</span>`
      : '';

    return `<button class="poi-list-item" data-poi-id="${poi.id}" type="button">
      ${iconHtml}
      <span class="poi-list-label">${displayLabel}</span>
      ${typeTag}
    </button>`;
  }

  function buildList() {
    const regionKey = getCurrentRegion();
    const region = getRegions()[regionKey];
    const categoryOrder = Object.keys(getPointCategories());

    // Group POIs by category while preserving taxonomy order.
    const grouped = new Map();
    (region?.pois ?? []).forEach(poi => {
      if (importantOnly && !isImportant(poi.category, poi.type)) return;
      if (!grouped.has(poi.category)) grouped.set(poi.category, []);
      grouped.get(poi.category).push(poi);
    });

    let html = '';
    categoryOrder.forEach(categoryKey => {
      const pois = grouped.get(categoryKey);
      if (!pois?.length) return;

      const meta = getCategoryMeta(categoryKey);
      const color = meta?.color ?? '#9ca3af';
      const categoryLabel = meta?.label ?? categoryKey;
      const items = groupByType
        ? Object.entries(pois.reduce((typeGroups, poi) => {
            if (!typeGroups[poi.type]) typeGroups[poi.type] = [];
            typeGroups[poi.type].push(poi);
            return typeGroups;
          }, {})).map(([typeKey, typePois]) => {
            const typeLabel = meta?.types?.[typeKey]?.label ?? typeKey;
            const typeItems = typePois.map(poi => renderPoiItem(poi, meta, color)).join('');
            return `<div class="poi-list-type-group">
              <div class="poi-list-type-header">${typeLabel}</div>
              <div class="poi-list-type-items">${typeItems}</div>
            </div>`;
          }).join('')
        : pois.map(poi => renderPoiItem(poi, meta, color)).join('');

      html += `<div class="poi-list-group">
        <div class="poi-list-group-header" style="--category-color: ${color}">
          <span class="poi-list-group-title">${categoryLabel}</span>
          <span class="poi-list-group-count">${pois.length}</span>
        </div>
        <div class="poi-list-group-items">${items}</div>
      </div>`;
    });

    listEls.forEach(el => {
      el.innerHTML = html;
      el.querySelectorAll('[data-poi-id]').forEach(button => {
        button.addEventListener('click', () => {
          const allPois = getRegions()[getCurrentRegion()]?.pois ?? [];
          const poi = allPois.find(p => p.id === button.dataset.poiId);
          if (poi) onPoiSelect(poi);
        });
      });
    });

    if (activeSearchTerm) filterList(activeSearchTerm);
  }

  function filterList(searchTerm) {
    activeSearchTerm = searchTerm;
    const term = searchTerm.toLowerCase().trim();

    listEls.forEach(el => {
      el.querySelectorAll('.poi-list-item').forEach(item => {
        const label = item.querySelector('.poi-list-label')?.textContent?.toLowerCase() ?? '';
        const type = item.querySelector('.poi-list-type')?.textContent?.toLowerCase() ?? '';
        item.hidden = term !== '' && !label.includes(term) && !type.includes(term);
      });

      el.querySelectorAll('.poi-list-group').forEach(group => {
        const visible = group.querySelectorAll('.poi-list-item:not([hidden])');
        group.hidden = visible.length === 0;
      });
    });
  }

  return { buildList, filterList };
}
