import { isRegionSelectable } from '../data/loadRegions.js';

export function createSearchAutocomplete({
  inputEl,
  getRegions,
  getCurrentRegion,
  getRegionIndex,
  getPointCategories,
  getCategoryMeta,
  getPointIcon,
  onSelect,
}) {
  const dropdown = document.createElement('ul');
  dropdown.className = 'search-suggestions';
  dropdown.hidden = true;
  document.body.appendChild(dropdown);

  let results = [];
  let activeItemIdx = -1;

  function getRegionData() {
    return getRegions()[getCurrentRegion()];
  }

  function dedupePois(pois) {
    const seen = new Set();
    return pois.filter(poi => {
      const key = poi.id ?? `${poi.category}:${poi.type}:${poi.pixelCoords?.join(',') ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function getPoiIconImage(categoryKey, typeKey, point) {
    const iconMarkup = getPointIcon(categoryKey, typeKey, point);
    const match = /--icon-url:\s*url\('([^']+)'\)/.exec(iconMarkup);
    if (!match) return '';
    return `<img class="search-suggestion-inner-icon" src="${match[1]}" alt="" aria-hidden="true" />`;
  }

  function getSearchIconImage(categoryKey, typeKey, point = null, fallbackSrc = '') {
    const iconHtml = getPoiIconImage(categoryKey, typeKey, point);
    if (iconHtml) return iconHtml;
    return fallbackSrc
      ? `<img class="search-suggestion-inner-icon" src="${fallbackSrc}" alt="" aria-hidden="true" />`
      : '';
  }

  function buildResults(term) {
    const t = term.toLowerCase().trim();
    if (!t) return [];

    const pois = getRegionData()?.pois ?? [];
    const categories = getPointCategories();
    const regionIndex = getRegionIndex();
    const collected = [];
    const currentRegionName = regionIndex[getCurrentRegion()]?.name ?? getCurrentRegion();

    // Named POIs: current region first, then other regions
    const currentRegionKey = getCurrentRegion();
    const allRegions = getRegions();
    const poiMatches = [];

    Object.entries(allRegions).forEach(([regionKey, regionData]) => {
      const regionPois = regionData?.pois ?? [];
      regionPois.forEach(poi => {
        if (!poi.name?.toLowerCase().includes(t)) return;
        poiMatches.push({ poi, regionKey });
      });
    });

    poiMatches
      .sort((a, b) => (a.regionKey === currentRegionKey ? -1 : 1) - (b.regionKey === currentRegionKey ? -1 : 1))
      .slice(0, 6)
      .forEach(({ poi, regionKey }) => {
        const cat = getCategoryMeta(poi.category);
        const typeMeta = cat?.types?.[poi.type];
        const typeLabel = typeMeta?.label ?? poi.type;
        const label = poi.number != null ? `${poi.name} #${poi.number}` : poi.name;
        const regionName = regionIndex[regionKey]?.name ?? regionKey;
        const sublabel = regionKey === currentRegionKey
          ? typeLabel
          : `${typeLabel} · ${regionName}`;
        collected.push({
          kind: 'poi',
          group: 'Named Places',
          label,
          sublabel,
          poi,
          regionKey,
          iconHtml: getPoiIconImage(poi.category, poi.type, poi),
          color: cat?.color,
        });
      });

    // Named region locations from all regions (from regions.json)
    const regionLocationMatches = [];
    Object.entries(regionIndex).forEach(([regionKey, regionMeta]) => {
      (regionMeta.locations ?? []).forEach(loc => {
        if (!loc.pixelCoords || !loc.name?.toLowerCase().includes(t)) return;
        regionLocationMatches.push({
          kind: 'location',
          group: 'Locations',
          label: loc.name,
          sublabel: regionMeta.name ?? regionKey,
          location: loc,
          regionKey,
          iconHtml: '<img class="search-suggestion-inner-icon" src="assets/icons/ui/map.svg" alt="" aria-hidden="true" />',
          color: '#6b7280',
        });
      });
    });
    collected.push(...regionLocationMatches.slice(0, 6));

    // Types: one aggregate result per type, backed by direct POIs and parent POIs
    // whose contents reference that type.
    const typeMatches = [];
    Object.entries(categories).forEach(([catKey, catMeta]) => {
      Object.entries(catMeta.types ?? {}).forEach(([typeKey, typeMeta]) => {
        if (!typeMeta.label?.toLowerCase().includes(t)) return;
        const matching = dedupePois(pois.filter(p => (
          (p.category === catKey && p.type === typeKey)
          || (Array.isArray(p.contents) && p.contents.includes(typeKey))
        )));
        if (!matching.length) return;
        typeMatches.push({
          kind: 'poi-group',
          group: 'Types',
          categoryKey: catKey,
          typeKey,
          label: typeMeta.label,
          sublabel: catMeta.label ?? catKey,
          matchCount: matching.length,
          pois: matching,
          iconHtml: getSearchIconImage(catKey, typeKey, matching[0]),
          color: catMeta?.color,
        });
      });
    });
    collected.push(...typeMatches.slice(0, 4));

    // Categories: one aggregate result per category, backed by all matching important POIs
    Object.entries(categories).forEach(([catKey, catMeta]) => {
      if (!catMeta.label?.toLowerCase().includes(t)) return;
      const categoryTypeKeys = new Set(Object.keys(catMeta.types ?? {}));
      const matching = dedupePois(pois.filter(p => (
        p.category === catKey
        || (Array.isArray(p.contents) && p.contents.some(typeKey => categoryTypeKeys.has(typeKey)))
      )));
      if (!matching.length) return;
      collected.push({
        kind: 'poi-group',
        group: 'Categories',
        categoryKey: catKey,
        label: catMeta.label,
        sublabel: currentRegionName,
        matchCount: matching.length,
        pois: matching,
        iconHtml: getSearchIconImage(catKey, matching[0]?.type ?? '', matching[0], 'assets/icons/ui/legend.svg'),
        color: catMeta?.color,
      });
    });

    // Regions
    Object.entries(regionIndex).forEach(([regionKey, regionMeta]) => {
      if (!isRegionSelectable(regionMeta)) return;
      if (!regionMeta.name?.toLowerCase().includes(t)) return;
      collected.push({
        kind: 'region',
        group: 'Regions',
        label: regionMeta.name,
        sublabel: 'Region in Great Bear Island',
        regionKey,
        iconHtml: '<img class="search-suggestion-inner-icon" src="assets/icons/ui/map.svg" alt="" aria-hidden="true" />',
        color: '#6b7280',
      });
    });

    return collected;
  }

  function positionDropdown() {
    const rect = inputEl.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 6}px`;
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.width = `${rect.width}px`;
  }

  function render(items) {
    results = items;
    activeItemIdx = -1;
    dropdown.innerHTML = '';

    if (!items.length) {
      dropdown.hidden = true;
      return;
    }

    let lastGroup = null;
    items.forEach((item, i) => {
      if (item.group !== lastGroup) {
        lastGroup = item.group;
        const header = document.createElement('li');
        header.className = 'search-suggestions-header';
        header.textContent = item.group;
        dropdown.appendChild(header);
      }

      const li = document.createElement('li');
      li.className = 'search-suggestion';
      li.dataset.index = i;

      const iconHtml = `<span class="search-suggestion-icon-wrap" style="background:${item.color ?? '#9ca3af'}">${
        item.iconHtml ?? ''
      }</span>`;

      li.innerHTML = `
        ${iconHtml}
        <span class="search-suggestion-text">
          <span class="search-suggestion-label">${item.label}</span>
          ${item.sublabel ? `<span class="search-suggestion-sub">${item.sublabel}</span>` : ''}
        </span>
        ${item.matchCount != null ? `<span class="search-suggestion-count">${item.matchCount}</span>` : ''}
      `;

      li.addEventListener('mousedown', e => {
        e.preventDefault();
        selectResult(Number(li.dataset.index));
      });

      dropdown.appendChild(li);
    });

    positionDropdown();
    dropdown.hidden = false;
  }

  function selectResult(index) {
    const item = results[index];
    if (!item) return;
    inputEl.value = item.label;
    closeDropdown();
    onSelect(item);
  }

  function closeDropdown() {
    dropdown.hidden = true;
    results = [];
    activeItemIdx = -1;
  }

  function reopenForCurrentValue() {
    const term = inputEl.value.trim();
    if (!term) return;
    render(buildResults(term));
  }

  inputEl.addEventListener('input', () => {
    render(buildResults(inputEl.value));
  });

  inputEl.addEventListener('focus', reopenForCurrentValue);
  inputEl.addEventListener('click', reopenForCurrentValue);

  inputEl.addEventListener('blur', () => {
    closeDropdown();
  });

  inputEl.addEventListener('keydown', e => {
    const items = [...dropdown.querySelectorAll('.search-suggestion')];
    if (e.key === 'Escape') {
      closeDropdown();
      inputEl.value = '';
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeItemIdx = Math.min(activeItemIdx + 1, items.length - 1);
      items.forEach((el, i) => el.classList.toggle('active', i === activeItemIdx));
      items[activeItemIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeItemIdx = Math.max(activeItemIdx - 1, -1);
      items.forEach((el, i) => el.classList.toggle('active', i === activeItemIdx));
      items[activeItemIdx >= 0 ? activeItemIdx : 0]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && activeItemIdx >= 0) {
      const active = items[activeItemIdx];
      if (active) selectResult(Number(active.dataset.index));
    }
  });

  return { closeDropdown };
}
