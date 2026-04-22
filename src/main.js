// App bootstrap and top-level wiring between state, map, legend, settings, and edit tools.
import { loadRegions, isRegionSelectable } from './data/loadRegions.js';
import { createMapView } from './map/mapView.js';
import { createMarkerController } from './map/markerController.js';
import { createLegendController, getFilterKey } from './ui/legendController.js';
import { createEditModeController } from './ui/editModeController.js';
import { createSettingsController } from './ui/settingsController.js';
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
import { getCategoryKeyForType as getCategoryKeyForTypeFromIndex } from './state/typeIndex.js';

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
  editPoiPanel: document.getElementById('edit-poi-panel'),
  editPoiForm: document.getElementById('edit-poi-form'),
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

function getCategoryKeyForType(typeKey) {
  return getCategoryKeyForTypeFromIndex(state.pointCategories, typeKey);
}

function getRelatedFilterKeys(point) {
  const filterKeys = new Set([getFilterKey(point.category, point.type)]);

  // Contents count as discoverable items for legend filters even when nested inside another POI.
  (point.contents ?? []).forEach(typeKey => {
    const categoryKey = getCategoryKeyForType(typeKey);
    if (!categoryKey) return;
    filterKeys.add(getFilterKey(categoryKey, typeKey));
  });

  return [...filterKeys];
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

function getRegionTransitionPois(regionKey) {
  return state.regions[regionKey].pois.filter(poi => Boolean(poi.transition));
}

function buildRegionStatsMarkup(regionKey) {
  const region = state.regions[regionKey];
  const transitions = getRegionTransitionPois(regionKey);
  const baseStats = (region.stats ?? []).filter(stat => stat.label !== 'Connects To');
  const stats = [
    ...baseStats,
    {
      label: 'Region Transitions',
      value: transitions.length
        ? transitions.map(transition => ({
            id: transition.id,
            label: state.regionIndex[transition.transition]?.name ?? transition.transition,
          }))
        : [],
    },
  ];

  return stats.map(stat => {
    // Transition stats render as buttons so the modal can jump straight to the matching marker.
    const valueMarkup = Array.isArray(stat.value)
      ? (
          stat.value.length
            ? `<div class="stat-transition-list">${stat.value.map(item => `
                <button type="button" class="stat-transition-link" data-transition-id="${item.id}">
                  ${item.label}
                </button>
              `).join('')}</div>`
            : '<div class="stat-value">None</div>'
        )
      : `<div class="stat-value">${stat.value}</div>`;

    return `
      <div class="stat-box">
        <div class="stat-label">${stat.label}</div>
        ${valueMarkup}
      </div>
    `;
  }).join('');
}

function updateRegionInfo(regionKey) {
  const { desc, name } = state.regions[regionKey];
  elements.regionInfoModalTitle.textContent = name;
  elements.regionDesc.textContent = desc;
  elements.regionStats.innerHTML = buildRegionStatsMarkup(regionKey);

  elements.regionStats.querySelectorAll('[data-transition-id]').forEach(button => {
    button.addEventListener('click', () => {
      const transitionPoi = getRegionTransitionPois(regionKey).find(poi => poi.id === button.dataset.transitionId);
      if (!transitionPoi) return;

      closeRegionInfoModal();
      const targetZoom = Math.min(mapView.map.getMaxZoom(), 0);
      mapView.map.setView(transitionPoi.coords, targetZoom, { animate: true });
      const markerEntry = markerController.getMarkerEntryForPoint(transitionPoi);
      if (markerEntry) {
        markerController.openPopupFromEntry(markerEntry);
      }
    });
  });
}

const mapView = createMapView(getCurrentRegion, regionKey => state.regions[regionKey]);

let editMode;
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
  isEditModeEnabled: () => editMode?.isEditModeEnabled() ?? false,
  onOpenEditEditor: entry => editMode?.openEditEditor(entry),
  onEditPointMoved: entry => editMode?.onExistingPointMoved(entry),
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

editMode = createEditModeController({
  map: mapView.map,
  mapView,
  elements,
  getRegions,
  getRegionIndex,
  getCurrentRegion,
  getPointCategories,
  getCategoryMeta,
  markerController,
  onChange: () => legendController.buildLegend(),
});

editMode.installControl();

function switchRegion(regionKey) {
  state.currentRegion = regionKey;
  // Default visible filters are derived from the region's actual POI/content types, not global taxonomy.
  state.activeTypeFilters = new Set(
    state.regions[regionKey].pois.flatMap(getRelatedFilterKeys),
  );

  markerController.closeCurrentPopup();
  editMode.clearEditPointers();
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
    markerController.closeCurrentPopup();
    legendController.toggleAll();
    editMode.setTemporaryMarkersVisible(getActiveFilters().size > 0);
  });
  settingsController.bind();

  elements.jsonModalClose.addEventListener('click', () => {
    resetJsonCopyButtonLabel();
    editMode.closeJsonModal();
  });
  elements.jsonModalCopy.addEventListener('click', () => {
    editMode.copyCurrentPoisSnapshot()
      .then(showJsonCopySuccess)
      .catch(error => {
        console.error('Failed to copy POI JSON', error);
      });
  });
  elements.jsonModalExport.addEventListener('click', () => editMode.exportCurrentPoisSnapshot());
  elements.jsonModalBackdrop.addEventListener('click', () => {
    resetJsonCopyButtonLabel();
    editMode.closeJsonModal();
  });
  elements.regionInfoTrigger.addEventListener('click', openRegionInfoModal);
  elements.regionInfoModalClose.addEventListener('click', closeRegionInfoModal);
  elements.regionInfoModalBackdrop.addEventListener('click', closeRegionInfoModal);

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!elements.jsonModal.hidden) {
      resetJsonCopyButtonLabel();
      editMode.closeJsonModal();
    }
    if (!elements.regionInfoModal.hidden) {
      closeRegionInfoModal();
    }
  });

  mapView.map.on('click', event => {
    if (!editMode.isEditModeEnabled()) return;
    editMode.addTemporaryMarker(event.latlng);
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
