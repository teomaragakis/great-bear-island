import { loadAreas } from './data/loadAreas.js';
import { createMapView } from './map/createMapView.js';
import { createMarkerController } from './map/createMarkerController.js';
import { createLegendController, getFilterKey } from './ui/createLegendController.js';
import { createDeveloperModeController } from './ui/createDeveloperModeController.js';
import { createSettingsController } from './ui/createSettingsController.js';
import {
  state,
  getAreas,
  getAreaIndex,
  getPointCategories,
  getCurrentArea,
  getActiveFilters,
  getCategoryMeta,
  getSubcategoryMeta,
  getPointIcon,
} from './state/appState.js';

const elements = {
  areaSelect: document.getElementById('area-select'),
  areaInfoTrigger: document.getElementById('area-info-trigger'),
  hideAllPois: document.getElementById('hide-all-pois'),
  settingsPanel: document.getElementById('sidebar-settings'),
  settingsToggle: document.getElementById('settings-toggle'),
  poiSearch: document.getElementById('poi-search'),
  poiSearchClear: document.getElementById('poi-search-clear'),
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
  areaInfoModal: document.getElementById('area-info-modal'),
  areaInfoModalTitle: document.getElementById('area-info-modal-title'),
  areaInfoModalClose: document.getElementById('area-info-modal-close'),
  areaInfoModalBackdrop: document.querySelector('[data-close-area-info-modal]'),
  layerButtons: document.querySelectorAll('.layer-btn'),
};

function openAreaInfoModal() {
  elements.areaInfoModal.hidden = false;
}

function closeAreaInfoModal() {
  elements.areaInfoModal.hidden = true;
}

function updateRegionInfo(areaKey) {
  const { info, name } = state.areas[areaKey];
  elements.areaInfoModalTitle.textContent = name;
  elements.regionDesc.textContent = info.desc;
  elements.regionStats.innerHTML = info.stats.map(stat => `
    <div class="stat-box">
      <div class="stat-label">${stat.label}</div>
      <div class="stat-value">${stat.value}</div>
    </div>
  `).join('');
}

const mapView = createMapView(getCurrentArea, areaKey => state.areas[areaKey]);

let developerMode;
const markerController = createMarkerController({
  map: mapView.map,
  getAreas,
  getCurrentArea,
  getActiveFilters,
  getCategoryMeta,
  getSubcategoryMeta,
  getPointIcon,
  isDeveloperModeEnabled: () => developerMode?.isDeveloperModeEnabled() ?? false,
  onOpenDeveloperEditor: entry => developerMode?.openDeveloperEditor(entry),
  onDeveloperPointMoved: entry => developerMode?.onExistingPointMoved(entry),
});

const settingsController = createSettingsController({
  elements,
  onChange: () => legendController.buildLegend(),
});

const legendController = createLegendController({
  legendEl: elements.legend,
  hideAllButtonEl: elements.hideAllPois,
  getAreas,
  getCurrentArea,
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
  getAreas,
  getAreaIndex,
  getCurrentArea,
  getPointCategories,
  getCategoryMeta,
  markerController,
});

developerMode.installControl();

function switchArea(areaKey) {
  state.currentArea = areaKey;
  state.activeSubcategoryFilters = new Set(
    state.areas[areaKey].pois.map(poi => getFilterKey(poi.category, poi.subcategory)),
  );

  markerController.closeCurrentPopup();
  developerMode.clearDeveloperPointers();
  mapView.loadMapLayer(areaKey, state.currentLayer);
  markerController.buildMarkers(areaKey);
  legendController.buildLegend(areaKey);
  updateRegionInfo(areaKey);
  mapView.updateBounds();
  mapView.fitArea(areaKey, true);
}

function switchLayer(layerKey) {
  state.currentLayer = layerKey;
  mapView.loadMapLayer(state.currentArea, layerKey);

  elements.layerButtons.forEach(button => {
    button.classList.toggle('active', button.dataset.layer === layerKey);
  });
}

function bindEvents() {
  elements.areaSelect.addEventListener('change', event => {
    switchArea(event.target.value);
  });

  elements.layerButtons.forEach(button => {
    button.addEventListener('click', () => switchLayer(button.dataset.layer));
  });

  elements.hideAllPois.addEventListener('click', () => {
    legendController.toggleAll();
  });
  settingsController.bind();

  elements.jsonModalClose.addEventListener('click', () => developerMode.closeJsonModal());
  elements.jsonModalCopy.addEventListener('click', () => {
    developerMode.copyCurrentPoisSnapshot().catch(error => {
      console.error('Failed to copy POI JSON', error);
    });
  });
  elements.jsonModalExport.addEventListener('click', () => developerMode.exportCurrentPoisSnapshot());
  elements.jsonModalBackdrop.addEventListener('click', () => developerMode.closeJsonModal());
  elements.areaInfoTrigger.addEventListener('click', openAreaInfoModal);
  elements.areaInfoModalClose.addEventListener('click', closeAreaInfoModal);
  elements.areaInfoModalBackdrop.addEventListener('click', closeAreaInfoModal);

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!elements.jsonModal.hidden) {
      developerMode.closeJsonModal();
    }
    if (!elements.areaInfoModal.hidden) {
      closeAreaInfoModal();
    }
  });

  mapView.map.on('click', event => {
    if (!developerMode.isDeveloperModeEnabled()) return;
    developerMode.addTemporaryMarker(event.latlng);
  });

  window.addEventListener('resize', () => {
    mapView.map.invalidateSize();
    mapView.updateBounds();
    mapView.map.fitBounds(mapView.getCurrentAreaBounds(), {
      padding: [0, 0],
      animate: false,
    });
  });
}

async function boot() {
  try {
    const loaded = await loadAreas();
    state.areaIndex = loaded.areaIndex;
    state.pointCategories = loaded.pointCategories;
    state.availableIcons = new Set(loaded.availableIcons);
    state.areas = loaded.areas;

    bindEvents();
    settingsController.sync();
    mapView.map.invalidateSize();
    elements.areaSelect.value = state.currentArea;
    switchArea(state.currentArea);
  } catch (error) {
    console.error(error);
  }
}

boot();
