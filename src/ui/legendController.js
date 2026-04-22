// Sidebar legend, search, and filter state synchronization for visible POI types.
import { getCategoryKeyForType } from '../state/typeIndex.js';

export function getFilterKey(categoryKey, typeKey) {
  return `${categoryKey}:${typeKey}`;
}

export function createLegendController({
  legendEl,
  hideAllButtonEl,
  getRegions,
  getCurrentRegion,
  getPointCategories,
  getActiveFilters,
  shouldHideMissingItems,
  shouldShowDlcItems,
  shouldFlattenItems,
  getSearchTerm,
  refreshMarkerVisibility,
  getPointIcon,
}) {
  const collapsedGroups = new Set();

  function getCurrentPois() {
    return getRegions()[getCurrentRegion()].pois;
  }

  function getRelatedFilterKeys(point) {
    // Contents contribute to legend counts and filtering even when they are not standalone POIs.
    const filterKeys = new Set([getFilterKey(point.category, point.type)]);

    (point.contents ?? []).forEach(typeKey => {
      const categoryKey = getCategoryKeyForType(getPointCategories(), typeKey);
      if (!categoryKey) return;
      filterKeys.add(getFilterKey(categoryKey, typeKey));
    });

    return [...filterKeys];
  }

  function getVisibleFilterKeys(filterKeys) {
    const activeFilters = getActiveFilters();
    return filterKeys.filter(filterKey => activeFilters.has(filterKey));
  }

  function setGroupCollapsed(groupKey, collapsed, groupEl = null, collapseToggleEl = null) {
    if (collapsed) {
      collapsedGroups.add(groupKey);
    } else {
      collapsedGroups.delete(groupKey);
    }

    if (groupEl && collapseToggleEl) {
      syncGroupCollapse(groupKey, groupEl, collapseToggleEl);
    }
  }

  function toggleTypeFilter(filterKey, el, groupFilterKeys, groupToggleEl) {
    const activeFilters = getActiveFilters();
    if (activeFilters.has(filterKey)) {
      activeFilters.delete(filterKey);
      el.classList.add('inactive');
    } else {
      activeFilters.add(filterKey);
      el.classList.remove('inactive');
    }

    syncLegendGroupToggle(groupToggleEl, groupFilterKeys);
    refreshMarkerVisibility();
  }

  function buildLegendItem({ categoryKey, category, typeKey, type, filterKey, count, isDisabled }, activeFilters, enabledFilterKeys, groupToggleEl = null) {
    if (!isDisabled) enabledFilterKeys.push(filterKey);

    const item = document.createElement('div');
    item.className = `legend-item${isDisabled ? ' disabled' : ''}${!isDisabled && !activeFilters.has(filterKey) ? ' inactive' : ''}`;
    item.dataset.filterKey = filterKey;
    item.style.setProperty('--category-color', category.color);
    item.innerHTML = `
      <div class="legend-dot"></div>
      <span class="legend-label">${getPointIcon(categoryKey, typeKey)} ${type.label}</span>
      <span class="legend-count">${count}</span>
    `;

    if (!isDisabled) {
      item.addEventListener('click', () => {
        toggleTypeFilter(filterKey, item, enabledFilterKeys, groupToggleEl);
      });
    }

    return item;
  }

  function getCategoryEntries(categoryKey, category, counts) {
    return Object.entries(category.types ?? {}).map(([typeKey, type]) => {
      const filterKey = getFilterKey(categoryKey, typeKey);
      const count = counts[filterKey] || 0;
      return {
        categoryKey,
        category,
        typeKey,
        type,
        filterKey,
        count,
        isDisabled: count === 0,
        isDlc: type.dlc === true,
      };
    });
  }

  function getVisibleEntries(entries) {
    return entries.filter(entry => shouldShowDlcItems() || !entry.isDlc);
  }

  function getSearchFilteredEntries(entries) {
    const searchTerm = getSearchTerm().trim().toLowerCase();
    if (!searchTerm) return entries;

    return entries.filter(entry => {
      const categoryLabel = entry.category.label.toLowerCase();
      const typeLabel = entry.type.label.toLowerCase();
      return categoryLabel.includes(searchTerm) || typeLabel.includes(searchTerm);
    });
  }

  function syncLegendGroupToggle(toggleEl, filterKeys) {
    const hasEnabledItems = filterKeys.length > 0;
    toggleEl.hidden = !hasEnabledItems;
    if (!hasEnabledItems) return;

    const allVisible = getVisibleFilterKeys(filterKeys).length === filterKeys.length;
    toggleEl.textContent = allVisible ? 'Hide' : 'Show';
  }

  function toggleLegendGroup(groupKey, filterKeys, itemsContainer, toggleEl, groupEl, collapseToggleEl) {
    if (!filterKeys.length) return;

    const activeFilters = getActiveFilters();
    const allVisible = getVisibleFilterKeys(filterKeys).length === filterKeys.length;

    filterKeys.forEach(filterKey => {
      if (allVisible) {
        activeFilters.delete(filterKey);
      } else {
        activeFilters.add(filterKey);
      }
    });

    itemsContainer.querySelectorAll('.legend-item:not(.disabled)').forEach(item => {
      const { filterKey } = item.dataset;
      item.classList.toggle('inactive', !activeFilters.has(filterKey));
    });

    setGroupCollapsed(groupKey, allVisible, groupEl, collapseToggleEl);
    syncLegendGroupToggle(toggleEl, filterKeys);
    refreshMarkerVisibility();
  }

  function syncGroupCollapse(groupKey, groupEl, collapseToggleEl) {
    const isCollapsed = collapsedGroups.has(groupKey);
    groupEl.classList.toggle('collapsed', isCollapsed);
    collapseToggleEl.setAttribute('aria-expanded', String(!isCollapsed));
    collapseToggleEl.innerHTML = `
      <span class="legend-group-chevron${isCollapsed ? ' collapsed' : ''}" aria-hidden="true">▾</span>
    `;
  }

  function toggleGroupCollapse(groupKey, groupEl, collapseToggleEl) {
    if (collapsedGroups.has(groupKey)) {
      collapsedGroups.delete(groupKey);
    } else {
      collapsedGroups.add(groupKey);
    }

    syncGroupCollapse(groupKey, groupEl, collapseToggleEl);
  }

  function buildLegend(regionKey = getCurrentRegion()) {
    // The legend is derived from the current region's live POI counts.
    const pois = getRegions()[regionKey].pois;
    const pointCategories = getPointCategories();
    const activeFilters = getActiveFilters();
    legendEl.innerHTML = '';

    const counts = {};
    pois.forEach(point => {
      getRelatedFilterKeys(point).forEach(filterKey => {
        counts[filterKey] = (counts[filterKey] || 0) + 1;
      });
    });

    if (shouldFlattenItems()) {
      // Flat mode turns the grouped legend into one alphabetized list.
      const flatContainer = document.createElement('div');
      flatContainer.className = 'legend-flat-list';
      const enabledFilterKeys = [];
      const flatEntries = Object.entries(pointCategories)
        .flatMap(([categoryKey, category]) => getSearchFilteredEntries(
          getVisibleEntries(getCategoryEntries(categoryKey, category, counts)),
        ))
        .filter(entry => !(shouldHideMissingItems() && entry.isDisabled))
        .sort((left, right) => left.type.label.localeCompare(right.type.label));

      flatEntries.forEach(entry => {
        flatContainer.appendChild(buildLegendItem(entry, activeFilters, enabledFilterKeys));
      });

      legendEl.appendChild(flatContainer);
      syncHeaderToggle();
      return;
    }

    Object.entries(pointCategories).forEach(([key, category]) => {
      const visibleEntries = getSearchFilteredEntries(
        getVisibleEntries(getCategoryEntries(key, category, counts)),
      );
      const hasAnyRegionItems = visibleEntries.some(entry => !entry.isDisabled);
      if (shouldHideMissingItems() && !hasAnyRegionItems) {
        return;
      }
      if (visibleEntries.length === 0) {
        return;
      }

      const group = document.createElement('section');
      group.className = 'legend-group';
      group.dataset.groupKey = key;

      const enabledFilterKeys = [];
      const header = document.createElement('div');
      header.className = 'legend-group-header';

      const title = document.createElement('button');
      title.type = 'button';
      title.className = 'legend-group-title';

      const heading = document.createElement('h3');
      heading.textContent = category.label;
      title.appendChild(heading);

      const collapseToggle = document.createElement('span');
      collapseToggle.className = 'legend-group-collapse';
      title.appendChild(collapseToggle);

      header.appendChild(title);

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'legend-group-toggle';
      header.appendChild(toggle);
      group.appendChild(header);

      const items = document.createElement('div');
      items.className = 'legend-group-items';

      visibleEntries.forEach(entry => {
        const { isDisabled } = entry;
        if (shouldHideMissingItems() && isDisabled) {
          return;
        }

        items.appendChild(buildLegendItem(entry, activeFilters, enabledFilterKeys, toggle));
      });

      syncGroupCollapse(key, group, collapseToggle);
      title.addEventListener('click', () => toggleGroupCollapse(key, group, collapseToggle));
      syncLegendGroupToggle(toggle, enabledFilterKeys);
      toggle.addEventListener('click', () => toggleLegendGroup(key, enabledFilterKeys, items, toggle, group, collapseToggle));

      group.appendChild(items);
      legendEl.appendChild(group);
    });

    syncHeaderToggle();
  }

  function syncHeaderToggle() {
    if (!hideAllButtonEl) return;

    const allHidden = getActiveFilters().size === 0;
    hideAllButtonEl.textContent = allHidden ? 'Show all' : 'Hide all';
  }

  function toggleAll() {
    const activeFilters = getActiveFilters();

    if (activeFilters.size === 0) {
      // Restore every filter represented by the current region, including content-only types.
      getCurrentPois().forEach(point => {
        getRelatedFilterKeys(point).forEach(filterKey => {
          activeFilters.add(filterKey);
        });
      });
    } else {
      activeFilters.clear();
    }

    refreshMarkerVisibility();
    buildLegend();
  }

  return {
    buildLegend,
    toggleAll,
  };
}
