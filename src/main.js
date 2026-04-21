// App bootstrap and top-level wiring between state, map, legend, settings, and developer tools.
import { loadRegions, isRegionSelectable } from './data/loadAreas.js';
import { createMapView } from './map/createMapView.js';
import { createMarkerController } from './map/createMarkerController.js';
import { createLegendController, getFilterKey } from './ui/createLegendController.js';
import { createDeveloperModeController } from './ui/createDeveloperModeController.js';
import { createSettingsController } from './ui/createSettingsController.js';
import {
  state,
  getRegions,
  getRegionIndex,
  getPointCategories,
  getCurrentRegion,
  getActiveFilters,
  getCategoryMeta,
  getTypeMeta,
  getPointIcon,
} from './state/appState.js';

const elements = {
  regionSelect: document.getElementById('area-select'),
  regionInfoTrigger: document.getElementById('area-info-trigger'),
  hideAllPois: document.getElementById('hide-all-pois'),
  settingsPanel: document.getElementById('sidebar-settings'),
  settingsToggle: document.getElementById('settings-toggle'),
  poiSearch: document.getElementById('poi-search'),
  poiSearchClear: document.getElementById('poi-search-clear'),
  groupPois: document.getElementById('group-pois'),
  groupByCategory: document.getElementById('group-by-category'),
  hideMissingPois: document.getElementById('hide-missing-pois'),
  showDlcPois: document.getElementById('show-dlc-pois'),
  flattenPois: document.getElementById('flatten-pois'),
  regionDesc: document.getElementById('region-desc'),
  regionStats: document.getElementById('region-stats'),
  legend: document.getElementById('legend'),
  developerPoiPanel: document.getElementById('developer-poi-panel'),
  developerPoiForm: document.getElementById('developer-poi-form'),
  jsonModal: document.getElementById('json-modal'),
  jsonModalContent: document.getElementById('json-modal-content'),
  jsonModalClose: document.getElementById('json-modal-close'),
  jsonModalCopy: document.getElementById('json-modal-copy'),
  jsonModalExport: document.getElementById('json-modal-export'),
  jsonModalBackdrop: document.querySelector('[data-close-json-modal]'),
  regionInfoModal: document.getElementById('area-info-modal'),
  regionInfoModalTitle: document.getElementById('area-info-modal-title'),
  regionInfoModalClose: document.getElementById('area-info-modal-close'),
  regionInfoModalBackdrop: document.querySelector('[data-close-area-info-modal]'),
  layerButtons: document.querySelectorAll('.layer-btn'),
};

let jsonCopyFeedbackTimeout = null;

function resetJsonCopyButtonLabel() {
  if (jsonCopyFeedbackTimeout) {
    window.clearTimeout(jsonCopyFeedbackTimeout);
    jsonCopyFeedbackTimeout = null;
  }
  elements.jsonModalCopy.textContent = 'Copy';
}

function showJsonCopySuccess() {
  resetJsonCopyButtonLabel();
  elements.jsonModalCopy.textContent = 'Copied to clipboard';
  jsonCopyFeedbackTimeout = window.setTimeout(() => {
    elements.jsonModalCopy.textContent = 'Copy';
    jsonCopyFeedbackTimeout = null;
  }, 1800);
}

function getSelectableRegionEntries() {
  return Object.entries(state.regionIndex).filter(([, regionMeta]) => isRegionSelectable(regionMeta));
}

function populateRegionSelect() {
  // The selector is driven entirely by region metadata, not hardcoded markup.
  const options = getSelectableRegionEntries()
    .map(([regionKey, regionMeta]) => `<option value="${regionKey}">${regionMeta.name}</option>`)
    .join('');

  elements.regionSelect.innerHTML = options;
}

function openRegionInfoModal() {
  elements.regionInfoModal.hidden = false;
}

function closeRegionInfoModal() {
  elements.regionInfoModal.hidden = true;
}

function updateRegionInfo(regionKey) {
  const { desc, stats = [], name } = state.regions[regionKey];
  elements.regionInfoModalTitle.textContent = name;
  elements.regionDesc.textContent = desc;
  elements.regionStats.innerHTML = stats.map(stat => `
    <div class="stat-box">
      <div class="stat-label">${stat.label}</div>
      <div class="stat-value">${stat.value}</div>
    </div>
  `).join('');
}

const mapView = createMapView(getCurrentRegion, regionKey => state.regions[regionKey]);

let developerMode;
// Controllers are kept loosely coupled and communicate through getters/callbacks.
const markerController = createMarkerController({
  map: mapView.map,
  getRegions,
  getRegionIndex,
  getCurrentRegion,
  getPointCategories,
  getActiveFilters,
  getCategoryMeta,
  getTypeMeta,
  getPointIcon,
  shouldClusterMarkers: () => settingsController.shouldGroupItems(),
  shouldClusterByCategory: () => settingsController.shouldGroupByCategory(),
  isDeveloperModeEnabled: () => developerMode?.isDeveloperModeEnabled() ?? false,
  onOpenDeveloperEditor: entry => developerMode?.openDeveloperEditor(entry),
  onDeveloperPointMoved: entry => developerMode?.onExistingPointMoved(entry),
});

const settingsController = createSettingsController({
  elements,
  onChange: () => legendController.buildLegend(),
  onGroupingChange: () => markerController.buildMarkers(),
});

const legendController = createLegendController({
  legendEl: elements.legend,
  hideAllButtonEl: elements.hideAllPois,
  getRegions,
  getCurrentRegion,
  getPointCategories,
  getActiveFilters,
  shouldHideMissingItems: () => settingsController.shouldHideMissingItems(),
  shouldShowDlcItems: () => settingsController.shouldShowDlcItems(),
  shouldFlattenItems: () => settingsController.shouldFlattenItems(),
  getSearchTerm: () => settingsController.getSearchTerm(),
  refreshMarkerVisibility: () => markerController.refreshMarkerVisibility(),
  getPointIcon,
});

developerMode = createDeveloperModeController({
  map: mapView.map,
  mapView,
  elements,
  getRegions,
  getRegionIndex,
  getCurrentRegion,
  getPointCategories,
  getCategoryMeta,
  markerController,
});

developerMode.installControl();

function switchRegion(regionKey) {
  state.currentRegion = regionKey;
  state.activeTypeFilters = new Set(
    state.regions[regionKey].pois.map(poi => getFilterKey(poi.category, poi.type)),
  );

  markerController.closeCurrentPopup();
  developerMode.clearDeveloperPointers();
  mapView.loadMapLayer(regionKey, state.currentLayer);
  markerController.buildMarkers(regionKey);
  legendController.buildLegend(regionKey);
  updateRegionInfo(regionKey);
  mapView.updateBounds();
  mapView.fitRegion(regionKey, true);
}

function switchLayer(layerKey) {
  state.currentLayer = layerKey;
  mapView.loadMapLayer(state.currentRegion, layerKey);

  elements.layerButtons.forEach(button => {
    button.classList.toggle('active', button.dataset.layer === layerKey);
  });
}

function bindEvents() {
  elements.regionSelect.addEventListener('change', event => {
    switchRegion(event.target.value);
  });

  elements.layerButtons.forEach(button => {
    button.addEventListener('click', () => switchLayer(button.dataset.layer));
  });

  elements.hideAllPois.addEventListener('click', () => {
    legendController.toggleAll();
  });
  settingsController.bind();

  elements.jsonModalClose.addEventListener('click', () => {
    resetJsonCopyButtonLabel();
    developerMode.closeJsonModal();
  });
  elements.jsonModalCopy.addEventListener('click', () => {
    developerMode.copyCurrentPoisSnapshot()
      .then(showJsonCopySuccess)
      .catch(error => {
        console.error('Failed to copy POI JSON', error);
      });
  });
  elements.jsonModalExport.addEventListener('click', () => developerMode.exportCurrentPoisSnapshot());
  elements.jsonModalBackdrop.addEventListener('click', () => {
    resetJsonCopyButtonLabel();
    developerMode.closeJsonModal();
  });
  elements.regionInfoTrigger.addEventListener('click', openRegionInfoModal);
  elements.regionInfoModalClose.addEventListener('click', closeRegionInfoModal);
  elements.regionInfoModalBackdrop.addEventListener('click', closeRegionInfoModal);

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!elements.jsonModal.hidden) {
      resetJsonCopyButtonLabel();
      developerMode.closeJsonModal();
    }
    if (!elements.regionInfoModal.hidden) {
      closeRegionInfoModal();
    }
  });

  mapView.map.on('click', event => {
    if (!developerMode.isDeveloperModeEnabled()) return;
    developerMode.addTemporaryMarker(event.latlng);
  });

  window.addEventListener('resize', () => {
    mapView.map.invalidateSize();
    mapView.updateBounds();
    mapView.map.fitBounds(mapView.getCurrentRegionBounds(), {
      padding: [0, 0],
      animate: false,
    });
  });
}

async function boot() {
  try {
    // Load data first, then bind UI so the first render uses the real dataset.
    const loaded = await loadRegions();
    state.regionIndex = loaded.regionIndex;
    state.pointCategories = loaded.pointCategories;
    state.availableIcons = new Set(loaded.availableIcons);
    state.regions = loaded.regions;

    populateRegionSelect();

    if (!state.regions[state.currentRegion]) {
      state.currentRegion = getSelectableRegionEntries()[0]?.[0] ?? '';
    }

    bindEvents();
    settingsController.sync();
    mapView.map.invalidateSize();
    elements.regionSelect.value = state.currentRegion;
    resetJsonCopyButtonLabel();
    switchRegion(state.currentRegion);
  } catch (error) {
    console.error(error);
  }
}

boot();
