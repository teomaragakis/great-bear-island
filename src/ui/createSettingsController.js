export function createSettingsController({ elements, onChange }) {
  const {
    settingsPanel,
    settingsToggle,
    poiSearch,
    poiSearchClear,
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

    hideMissingPois.addEventListener('change', onChange);
    showDlcPois.addEventListener('change', onChange);
    flattenPois.addEventListener('change', onChange);
  }

  function sync() {
    syncPoiSearchClearButton();
    syncSettingsCollapse();
  }

  return {
    bind,
    sync,
    shouldHideMissingItems,
    shouldShowDlcItems,
    shouldFlattenItems,
    getSearchTerm,
  };
}
