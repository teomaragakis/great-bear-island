export function createSettingsController({ elements, onChange, onGroupingChange }) {
  const STORAGE_KEY = 'great-bear-island:settings';
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

  function loadPersistedSettings() {
    try {
      return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
    } catch {
      return {};
    }
  }

  function savePersistedSettings() {
    const payload = {
      poiSearch: poiSearch.value,
      groupPois: groupPois.checked,
      groupByCategory: groupByCategory.checked,
      hideMissingPois: hideMissingPois.checked,
      showDlcPois: showDlcPois.checked,
      flattenPois: flattenPois.checked,
      settingsCollapsed: settingsPanel.classList.contains('collapsed'),
    };

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage failures; settings just won't persist.
    }
  }

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
      savePersistedSettings();
    });

    poiSearch.addEventListener('input', () => {
      syncPoiSearchClearButton();
      savePersistedSettings();
      onChange();
    });

    poiSearchClear.addEventListener('click', () => {
      poiSearch.value = '';
      syncPoiSearchClearButton();
      savePersistedSettings();
      onChange();
      poiSearch.focus();
    });

    groupPois.addEventListener('change', () => {
      syncGroupingDependencies();
      savePersistedSettings();
      onGroupingChange?.();
      onChange();
    });
    groupByCategory.addEventListener('change', () => {
      savePersistedSettings();
      onGroupingChange?.();
      onChange();
    });
    hideMissingPois.addEventListener('change', () => {
      savePersistedSettings();
      onChange();
    });
    showDlcPois.addEventListener('change', () => {
      savePersistedSettings();
      onChange();
    });
    flattenPois.addEventListener('change', () => {
      savePersistedSettings();
      onChange();
    });
  }

  function sync() {
    const persisted = loadPersistedSettings();
    poiSearch.value = persisted.poiSearch ?? '';
    groupPois.checked = persisted.groupPois ?? true;
    groupByCategory.checked = persisted.groupByCategory ?? true;
    hideMissingPois.checked = persisted.hideMissingPois ?? true;
    showDlcPois.checked = persisted.showDlcPois ?? true;
    flattenPois.checked = persisted.flattenPois ?? false;
    settingsPanel.classList.toggle('collapsed', persisted.settingsCollapsed ?? true);
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
