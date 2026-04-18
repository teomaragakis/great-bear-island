export function createSettingsController({ elements, onChange, onGroupingChange }) {
  const {
    settingsPanel,
    settingsToggle,
    poiSearch,
    poiSearchClear,
    groupPois,
    groupByCategory,
    hideMissingPois,
    showDlcPois,
    flattenPois,
  } = elements;

  function shouldHideMissingItems() {
    return hideMissingPois.checked;
  }

  function shouldShowDlcItems() {
    return showDlcPois.checked;
  }

  function shouldFlattenItems() {
    return flattenPois.checked;
  }

  function shouldGroupItems() {
    return groupPois.checked;
  }

  function shouldGroupByCategory() {
    return groupPois.checked && groupByCategory.checked;
  }

  function getSearchTerm() {
    return poiSearch.value;
  }

  function syncPoiSearchClearButton() {
    poiSearchClear.hidden = poiSearch.value.length === 0;
  }

  function syncSettingsCollapse() {
    const isCollapsed = settingsPanel.classList.contains('collapsed');
    settingsToggle.setAttribute('aria-expanded', String(!isCollapsed));
  }

  function syncGroupingDependencies() {
    groupByCategory.disabled = !groupPois.checked;
  }

  function bind() {
    settingsToggle.addEventListener('click', () => {
      settingsPanel.classList.toggle('collapsed');
      syncSettingsCollapse();
    });

    poiSearch.addEventListener('input', () => {
      syncPoiSearchClearButton();
      onChange();
    });

    poiSearchClear.addEventListener('click', () => {
      poiSearch.value = '';
      syncPoiSearchClearButton();
      onChange();
      poiSearch.focus();
    });

    groupPois.addEventListener('change', () => {
      syncGroupingDependencies();
      onGroupingChange?.();
      onChange();
    });
    groupByCategory.addEventListener('change', () => {
      onGroupingChange?.();
      onChange();
    });
    hideMissingPois.addEventListener('change', onChange);
    showDlcPois.addEventListener('change', onChange);
    flattenPois.addEventListener('change', onChange);
  }

  function sync() {
    syncPoiSearchClearButton();
    syncSettingsCollapse();
    syncGroupingDependencies();
  }

  return {
    bind,
    sync,
    shouldHideMissingItems,
    shouldShowDlcItems,
    shouldFlattenItems,
    shouldGroupItems,
    shouldGroupByCategory,
    getSearchTerm,
  };
}
