// App bootstrap and top-level wiring between state, map, legend, settings, edit tools, and panel UI.
import { loadRegions, isRegionSelectable, px } from './data/loadRegions.js';
import { createMapView } from './map/mapView.js';
import { createMarkerController } from './map/markerController.js';
import { createLegendController, getFilterKey } from './ui/legendController.js';
import { createEditModeController } from './ui/editModeController.js';
import { createSettingsController } from './ui/settingsController.js';
import { createListModeController } from './ui/listModeController.js';
import { createSearchAutocomplete } from './ui/searchAutocomplete.js';
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
  poiSearch: document.getElementById('poi-filter'),
  poiSearchClear: document.getElementById('poi-filter-clear'),
  editPoiSearch: document.getElementById('edit-poi-filter'),
  editPoiSearchClear: document.getElementById('edit-poi-filter-clear'),
  leftSearchInput: document.getElementById('left-search-input'),
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
  jsonModalTrigger: document.getElementById('json-modal-trigger'),
  mapPanelFooter: document.getElementById('map-panel-footer'),
  regionInfoModal: document.getElementById('area-info-modal'),
  regionInfoModalTitle: document.getElementById('area-info-modal-title'),
  regionInfoModalClose: document.getElementById('area-info-modal-close'),
  regionInfoModalBackdrop: document.querySelector('[data-close-area-info-modal]'),
  regionSwitchModal: document.getElementById('region-switch-modal'),
  regionSwitchModalText: document.getElementById('region-switch-modal-text'),
  regionSwitchModalClose: document.getElementById('region-switch-modal-close'),
  regionSwitchModalCancel: document.getElementById('region-switch-modal-cancel'),
  regionSwitchModalConfirm: document.getElementById('region-switch-modal-confirm'),
  regionSwitchModalBackdrop: document.querySelector('[data-close-region-switch-modal]'),
  layerButtons: document.querySelectorAll('.layer-btn'),
  // Panel UI
  panel: document.getElementById('map-panel'),
  panelToggleBtn: document.getElementById('panel-toggle-btn'),
  panelBackdrop: document.getElementById('panel-backdrop'),
  panelDragHandle: document.getElementById('panel-drag-handle'),
  panelModeTabs: document.querySelectorAll('.map-mode-control .panel-mode-tab'),
  mobileNavBtns: document.querySelectorAll('.mobile-nav-btn'),
  panelPaneExplore: document.getElementById('panel-pane-explore'),
  panelPaneSearch: document.getElementById('panel-pane-search'),
  panelPaneEdit: document.getElementById('panel-pane-edit'),
  panelPanePoiInfo: document.getElementById('panel-pane-poi-info'),
  panelPanePoiEdit: document.getElementById('panel-pane-poi-edit'),
  poiList: document.getElementById('poi-list'),
  editLegend: document.getElementById('edit-poi-list'),
  panelRegionName: document.getElementById('panel-region-name'),
  // POI info panel
  poiPanelWrapper: document.getElementById('poi-panel-wrapper'),
  poiInfoPanel: document.getElementById('poi-info-panel'),
  poiInfoIcon: document.getElementById('poi-info-icon'),
  poiInfoKicker: document.getElementById('poi-info-kicker'),
  poiInfoName: document.getElementById('poi-info-name'),
  poiInfoContent: document.getElementById('poi-info-content'),
  poiInfoFooter: document.getElementById('poi-info-footer'),
  poiInfoLink: document.getElementById('poi-info-link'),
  poiInfoCloseBtn: document.getElementById('poi-info-close-btn'),
};

// ── Panel / mode state ──────────────────────────────────────────────────────
let currentMode = 'explore';    // 'explore' | 'search' | 'edit'
let isPanelOpen = true;
let isMobileExpanded = false;
let listController = null;      // search pane — important POIs only
let savedExploreFilters = null; // filters saved when entering search mode
let pendingRegionSwitchAction = null;

function isMobileBreakpoint() {
  return window.matchMedia('(max-width: 640px)').matches;
}

// ── Panel open / close (desktop) ────────────────────────────────────────────
function openPanel() {
  isPanelOpen = true;
  elements.panel.classList.remove('panel-hidden');
  elements.panelToggleBtn.setAttribute('aria-expanded', 'true');
  elements.panelToggleBtn.innerHTML = '✕';
  mapView.map.invalidateSize();
}

function closePanel() {
  isPanelOpen = false;
  elements.panel.classList.add('panel-hidden');
  elements.panelToggleBtn.setAttribute('aria-expanded', 'false');
  elements.panelToggleBtn.innerHTML = '<img src="assets/icons/ui/legend.svg" alt="" aria-hidden="true" />';
  mapView.map.invalidateSize();
}

// ── Bottom-sheet expand / collapse (mobile) ──────────────────────────────────
function expandMobilePanel() {
  isMobileExpanded = true;
  elements.panel.classList.add('panel-expanded');
  elements.panelBackdrop.hidden = false;
  mapView.map.invalidateSize();
}

function collapseMobilePanel() {
  isMobileExpanded = false;
  elements.panel.classList.remove('panel-expanded');
  elements.panelBackdrop.hidden = true;
  mapView.map.invalidateSize();
}

// ── Mode switching ───────────────────────────────────────────────────────────
function switchMode(mode) {
  const prevMode = currentMode;

  if (mode === currentMode) {
    // On mobile, re-tapping the active mode tab expands the panel.
    if (isMobileBreakpoint() && !isMobileExpanded) expandMobilePanel();
    return;
  }

  currentMode = mode;

  // Sync all tab indicators (desktop tabs + mobile nav).
  elements.panelModeTabs.forEach(tab =>
    tab.classList.toggle('active', tab.dataset.mode === mode),
  );
  elements.mobileNavBtns.forEach(btn =>
    btn.classList.toggle('active', btn.dataset.mode === mode),
  );

  // Show the right pane.
  elements.panelPaneExplore.hidden = mode === 'edit';
  elements.panelPaneSearch.hidden = true;
  elements.panelPaneEdit.hidden = mode !== 'edit';
  elements.mapPanelFooter.hidden = mode !== 'edit';
  elements.jsonModalTrigger.hidden = mode !== 'edit';
  elements.leftSearchInput.hidden = mode !== 'search';

  // Toggle edit mode on / off.
  if (mode === 'edit') {
    editMode.setEditMode(true);
  } else if (prevMode === 'edit') {
    editMode.setEditMode(false);
    elements.panelPanePoiInfo.hidden = false;
    elements.panelPanePoiEdit.hidden = true;
    hidePoiInfoPanel();
  }

  // Search mode uses important-only filters; restore on exit.
  if (mode === 'search') {
    savedExploreFilters = new Set(state.activeTypeFilters);
    state.activeTypeFilters = computeImportantFilterKeys(state.currentRegion);
    buildLegendForCurrentMode();
    markerController.refreshMarkerVisibility();
  } else if (prevMode === 'search' && savedExploreFilters) {
    state.activeTypeFilters = savedExploreFilters;
    savedExploreFilters = null;
    buildLegendForCurrentMode();
    markerController.refreshMarkerVisibility();
  }

  if (mode === 'search') {
    elements.leftSearchInput.focus();
  }

  mapView.map.invalidateSize();
}

// ── JSON copy feedback ───────────────────────────────────────────────────────
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
  (point.contents ?? []).forEach(typeKey => {
    const categoryKey = getCategoryKeyForType(typeKey);
    if (!categoryKey) return;
    filterKeys.add(getFilterKey(categoryKey, typeKey));
  });
  return [...filterKeys];
}

function computeImportantFilterKeys(regionKey) {
  const pois = state.regions[regionKey]?.pois ?? [];
  return new Set(
    pois
      .filter(poi => {
        const cat = getCategoryMeta(poi.category);
        const type = cat?.types?.[poi.type];
        return cat?.important === true || type?.important === true;
      })
      .map(poi => getFilterKey(poi.category, poi.type)),
  );
}

function populateRegionSelect() {
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

function openRegionSwitchModal(message, onConfirm) {
  pendingRegionSwitchAction = onConfirm;
  elements.regionSwitchModalText.textContent = message;
  elements.regionSwitchModal.hidden = false;
}

function closeRegionSwitchModal() {
  pendingRegionSwitchAction = null;
  elements.regionSwitchModal.hidden = true;
}

function confirmRegionSwitchModal() {
  const action = pendingRegionSwitchAction;
  closeRegionSwitchModal();
  action?.();
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
  const { info, name } = state.regions[regionKey];
  elements.regionInfoModalTitle.textContent = name;
  elements.panelRegionName.textContent = name;
  elements.regionDesc.textContent = info;
  elements.regionStats.innerHTML = buildRegionStatsMarkup(regionKey);

  elements.regionStats.querySelectorAll('[data-transition-id]').forEach(button => {
    button.addEventListener('click', () => {
      const transitionPoi = getRegionTransitionPois(regionKey).find(poi => poi.id === button.dataset.transitionId);
      if (!transitionPoi) return;

      closeRegionInfoModal();
      const targetZoom = Math.min(mapView.map.getMaxZoom(), 0);
      mapView.map.setView(transitionPoi.coords, targetZoom, { animate: true });
      const markerEntry = markerController.getMarkerEntryForPoint(transitionPoi);
      if (markerEntry) markerController.openPopupFromEntry(markerEntry);
    });
  });
}

const mapView = createMapView(getCurrentRegion, regionKey => state.regions[regionKey]);

function poiDisplayName(point, fallbackType, fallbackCategory) {
  const base = point.name || fallbackType?.label || fallbackCategory?.label || '';
  return point.number != null ? `${base} #${point.number}` : base;
}

function setPoiInfoFooter(url) {
  if (url) {
    elements.poiInfoLink.href = url;
    elements.poiInfoFooter.hidden = false;
  } else {
    elements.poiInfoLink.href = '';
    elements.poiInfoFooter.hidden = true;
  }
}

function showEditInfoPanel(entry) {
  const point = entry.point ?? entry.poi;
  const category = getCategoryMeta(point.category);
  const type = getTypeMeta(point.category, point.type);
  elements.poiInfoIcon.innerHTML = getPointIcon(point.category, point.type, point);
  elements.poiInfoKicker.textContent = category.label;
  elements.poiInfoKicker.style.color = category.color;
  elements.poiInfoName.textContent = poiDisplayName(point, type, category);
  elements.panelPanePoiInfo.hidden = true;
  elements.panelPanePoiEdit.hidden = false;
  elements.poiInfoFooter.hidden = true;
  elements.poiPanelWrapper.classList.add('panel-visible');
}

function showLocationInfoPanel(location, regionName = '') {
  elements.panelPanePoiInfo.hidden = false;
  elements.panelPanePoiEdit.hidden = true;
  elements.poiInfoIcon.innerHTML = '';
  elements.poiInfoKicker.textContent = regionName ? `Location in ${regionName}` : 'Location';
  elements.poiInfoKicker.style.color = '';
  elements.poiInfoName.textContent = location.name;
  const content = location.info ? `<div class="info-item"><div class="popup-label">Description</div><div class="info-item-value">${location.info}</div></div>` : '';
  elements.poiInfoContent.innerHTML = content;
  elements.poiInfoContent.hidden = !content;
  setPoiInfoFooter(location.url);
  elements.poiPanelWrapper.classList.add('panel-visible');
}

function showSearchGroupInfoPanel(item) {
  elements.panelPanePoiInfo.hidden = false;
  elements.panelPanePoiEdit.hidden = true;
  elements.poiInfoIcon.innerHTML = '';
  elements.poiInfoKicker.textContent = item.group;
  elements.poiInfoKicker.style.color = item.color ?? '';
  elements.poiInfoName.textContent = item.label;
  elements.poiInfoContent.innerHTML = `
    <div class="info-item">
      <div class="popup-label">Matches</div>
      <div class="info-item-value">${item.pois.length}</div>
    </div>
    ${item.sublabel ? `
      <div class="info-item">
        <div class="popup-label">Scope</div>
        <div class="info-item-value">${item.sublabel}</div>
      </div>
    ` : ''}
  `;
  elements.poiInfoContent.hidden = false;
  setPoiInfoFooter(null);
  elements.poiPanelWrapper.classList.add('panel-visible');
}

function showPoiInfoPanel(point) {
  elements.panelPanePoiInfo.hidden = false;
  elements.panelPanePoiEdit.hidden = true;
  const category = getCategoryMeta(point.category);
  const type = getTypeMeta(point.category, point.type);
  elements.poiInfoIcon.innerHTML = getPointIcon(point.category, point.type, point);
  elements.poiInfoKicker.textContent = category.label;
  elements.poiInfoKicker.style.color = category.color;
  elements.poiInfoName.textContent = poiDisplayName(point, type, category);
  const content = markerController.getPoiInfoContent(point).trim();
  elements.poiInfoContent.innerHTML = content;
  elements.poiInfoContent.hidden = !content;
  setPoiInfoFooter(point.url ?? type?.url ?? null);
  elements.poiPanelWrapper.classList.add('panel-visible');
}

function hidePoiInfoPanel() {
  elements.poiPanelWrapper.classList.remove('panel-visible');
}

let editMode;
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
  onPoiOpen: point => showPoiInfoPanel(point),
  onPoiClose: hidePoiInfoPanel,
  onLocationOpen: location => showLocationInfoPanel(location, state.regionIndex[state.currentRegion]?.name ?? ''),
});

const settingsController = createSettingsController({
  elements,
  onChange: () => {
    legendController.buildLegend();
  },
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

const editLegendController = createLegendController({
  legendEl: elements.editLegend,
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
  onEditOpen: entry => showEditInfoPanel(entry),
});

function buildLegendForCurrentMode(regionKey = getCurrentRegion()) {
  if (currentMode === 'explore') {
    legendController.expandAllGroups();
  } else if (currentMode === 'edit') {
    editLegendController.expandAllGroups();
  }
  if (currentMode === 'edit') {
    editLegendController.buildLegend(regionKey, false);
    return;
  }
  legendController.buildLegend(regionKey, currentMode === 'search');
}

function switchRegion(regionKey) {
  state.currentRegion = regionKey;
  localStorage.setItem('gbi-last-region', regionKey);
  const allRegionFilters = new Set(state.regions[regionKey].pois.flatMap(getRelatedFilterKeys));
  if (currentMode === 'search') {
    savedExploreFilters = allRegionFilters;
    state.activeTypeFilters = computeImportantFilterKeys(regionKey);
  } else {
    state.activeTypeFilters = allRegionFilters;
  }

  markerController.closeCurrentPopup();
  editMode.clearEditPointers();
  mapView.loadMapLayer(regionKey, state.currentLayer);
  markerController.buildMarkers(regionKey);
  buildLegendForCurrentMode(regionKey);
  updateRegionInfo(regionKey);
  mapView.updateBounds();
  mapView.fitRegion(regionKey, true);

  if (currentMode === 'search' && listController) {
    listController.buildList();
  }
}

function switchLayer(layerKey) {
  state.currentLayer = layerKey;
  mapView.loadMapLayer(state.currentRegion, layerKey);
  elements.layerButtons.forEach(button => {
    button.classList.toggle('active', button.dataset.layer === layerKey);
  });
}

function revealSearchResult(item) {
  if (currentMode !== 'search') return;

  if (item.kind === 'poi-group') {
    const pois = item.pois ?? [];
    if (!pois.length) return;

    if (item.group === 'Types' && item.categoryKey && item.typeKey) {
      state.activeTypeFilters.add(getFilterKey(item.categoryKey, item.typeKey));
    } else if (item.group === 'Categories' && item.categoryKey) {
      legendController.expandGroup(item.categoryKey);
      const categoryTypeKeys = new Set();
      pois.forEach(poi => {
        if (poi.category === item.categoryKey) {
          categoryTypeKeys.add(poi.type);
        }
        (poi.contents ?? []).forEach(typeKey => {
          const categoryKey = getCategoryKeyForType(typeKey);
          if (categoryKey === item.categoryKey) {
            categoryTypeKeys.add(typeKey);
          }
        });
      });
      categoryTypeKeys.forEach(typeKey => {
        state.activeTypeFilters.add(getFilterKey(item.categoryKey, typeKey));
      });
    } else {
      pois.forEach(poi => {
        getRelatedFilterKeys(poi).forEach(filterKey => {
          state.activeTypeFilters.add(filterKey);
        });
      });
    }
  } else if (item.kind === 'poi' && item.poi) {
    getRelatedFilterKeys(item.poi).forEach(filterKey => {
      state.activeTypeFilters.add(filterKey);
    });
  } else {
    return;
  }

  buildLegendForCurrentMode();
  markerController.refreshMarkerVisibility();
}

function getPreservedSelectedFilterKeys() {
  const activePoi = markerController.getActiveViewPoi();
  if (!activePoi) return [];
  return [getFilterKey(activePoi.category, activePoi.type)];
}

function maybeConfirmCrossRegionSearchResult(item, onContinue) {
  const targetRegionKey = item.regionKey;
  if (!targetRegionKey || targetRegionKey === getCurrentRegion()) {
    onContinue();
    return;
  }

  const targetRegionName = state.regionIndex[targetRegionKey]?.name ?? targetRegionKey;
  openRegionSwitchModal(`This result is in ${targetRegionName}. Do you want to open that region?`, onContinue);
}

function bindEvents() {
  // Region / layer selectors
  elements.regionSelect.addEventListener('change', event => {
    switchRegion(event.target.value);
  });
  elements.layerButtons.forEach(button => {
    button.addEventListener('click', () => switchLayer(button.dataset.layer));
  });

  // Legend "hide all"
  elements.hideAllPois.addEventListener('click', () => {
    const preservedFilterKeys = getPreservedSelectedFilterKeys();
    markerController.closeCurrentPopup();
    legendController.toggleAll(preservedFilterKeys);
    editMode.setTemporaryMarkersVisible(getActiveFilters().size > 0);
  });

  // Left search autocomplete (search mode)
  createSearchAutocomplete({
    inputEl: elements.leftSearchInput,
    getRegions,
    getCurrentRegion,
    getRegionIndex,
    getPointCategories,
    getCategoryMeta,
    getPointIcon,
    onSelect: item => {
      maybeConfirmCrossRegionSearchResult(item, () => {
        const targetZoom = Math.min(mapView.map.getMaxZoom(), 0);
        if (item.kind === 'region') {
          switchRegion(item.regionKey);
          elements.regionSelect.value = item.regionKey;
        } else if (item.kind === 'location') {
          if (item.regionKey !== getCurrentRegion()) {
            switchRegion(item.regionKey);
            elements.regionSelect.value = item.regionKey;
          }
          const [x, y] = item.location.pixelCoords;
          mapView.map.setView(px(x, y), targetZoom, { animate: true });
          showLocationInfoPanel(item.location, state.regionIndex[item.regionKey]?.name ?? '');
        } else if (item.kind === 'poi-group') {
          revealSearchResult(item);
          if (item.pois.length === 1) {
            mapView.map.setView(item.pois[0].coords, targetZoom, { animate: true });
            const markerEntry = markerController.getMarkerEntryForPoint(item.pois[0]);
            if (markerEntry) markerController.openPopupFromEntry(markerEntry);
          } else {
            mapView.map.fitBounds(item.pois.map(p => p.coords), { padding: [60, 60], animate: true });
            showSearchGroupInfoPanel(item);
          }
        } else {
          if (item.regionKey && item.regionKey !== getCurrentRegion()) {
            switchRegion(item.regionKey);
            elements.regionSelect.value = item.regionKey;
          }
          revealSearchResult(item);
          mapView.map.setView(item.poi.coords, targetZoom, { animate: true });
          const markerEntry = markerController.getMarkerEntryForPoint(item.poi);
          if (markerEntry) markerController.openPopupFromEntry(markerEntry);
        }
        if (isMobileBreakpoint()) collapseMobilePanel();
      });
    },
  });

  // Settings
  settingsController.bind();

  // JSON modal
  elements.jsonModalClose.addEventListener('click', () => {
    resetJsonCopyButtonLabel();
    editMode.closeJsonModal();
  });
  elements.jsonModalCopy.addEventListener('click', () => {
    editMode.copyCurrentPoisSnapshot()
      .then(showJsonCopySuccess)
      .catch(error => console.error('Failed to copy POI JSON', error));
  });
  elements.jsonModalExport.addEventListener('click', () => editMode.exportCurrentPoisSnapshot());
  elements.jsonModalBackdrop.addEventListener('click', () => {
    resetJsonCopyButtonLabel();
    editMode.closeJsonModal();
  });
  elements.jsonModalTrigger.addEventListener('click', () => editMode.openJsonModal());

  // Area info modal
  elements.regionInfoTrigger.addEventListener('click', openRegionInfoModal);
  elements.regionInfoModalClose.addEventListener('click', closeRegionInfoModal);
  elements.regionInfoModalBackdrop.addEventListener('click', closeRegionInfoModal);
  elements.regionSwitchModalClose.addEventListener('click', closeRegionSwitchModal);
  elements.regionSwitchModalCancel.addEventListener('click', closeRegionSwitchModal);
  elements.regionSwitchModalConfirm.addEventListener('click', confirmRegionSwitchModal);
  elements.regionSwitchModalBackdrop.addEventListener('click', closeRegionSwitchModal);

  // ── POI info panel close ────────────────────────────────────────────────
  elements.poiInfoCloseBtn.addEventListener('click', () => {
    markerController.closeCurrentPopup();
    editMode.hideEditEditor();
    elements.panelPanePoiInfo.hidden = false;
    elements.panelPanePoiEdit.hidden = true;
    hidePoiInfoPanel();
  });

  // ── Panel toggle (desktop) ──────────────────────────────────────────────
  elements.panelToggleBtn.addEventListener('click', () => {
    if (isMobileBreakpoint()) {
      if (isMobileExpanded) collapseMobilePanel();
      else expandMobilePanel();
    } else {
      if (isPanelOpen) closePanel();
      else openPanel();
    }
  });

  // ── Mobile: drag handle tap expands / collapses ─────────────────────────
  elements.panelDragHandle.addEventListener('click', () => {
    if (isMobileExpanded) collapseMobilePanel();
    else expandMobilePanel();
  });

  // ── Mobile: tap search input → expand panel ─────────────────────────────
  elements.poiSearch.addEventListener('focus', () => {
    if (isMobileBreakpoint() && !isMobileExpanded) expandMobilePanel();
  });

  // ── Backdrop tap collapses mobile panel ─────────────────────────────────
  elements.panelBackdrop.addEventListener('click', collapseMobilePanel);

  // ── Mode tabs (desktop) ─────────────────────────────────────────────────
  elements.panelModeTabs.forEach(tab => {
    tab.addEventListener('click', () => switchMode(tab.dataset.mode));
  });

  // ── Mode nav (mobile) ───────────────────────────────────────────────────
  elements.mobileNavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchMode(btn.dataset.mode);
    });
  });

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (!elements.jsonModal.hidden) {
        resetJsonCopyButtonLabel();
        editMode.closeJsonModal();
      }
      if (!elements.regionInfoModal.hidden) closeRegionInfoModal();
      if (!elements.regionSwitchModal.hidden) closeRegionSwitchModal();
      if (isMobileExpanded) collapseMobilePanel();
      return;
    }

    if (event.key !== 'Backspace') return;
    if (!editMode.isEditModeEnabled()) return;
    if (!elements.jsonModal.hidden || !elements.regionInfoModal.hidden) return;

    const target = event.target;
    const isTypingTarget = target instanceof HTMLElement && (
      target.matches('input, textarea, [contenteditable="true"]')
      || target.closest('input, textarea, [contenteditable="true"]')
    );
    if (isTypingTarget) return;

    event.preventDefault();
    editMode.deleteActiveEntry();
  });

  // ── Map click → add temporary POI in edit mode ──────────────────────────
  mapView.map.on('click', event => {
    if (!editMode.isEditModeEnabled()) return;
    editMode.addTemporaryMarker(event.latlng);
    // Ensure the edit pane is visible on mobile after adding a POI.
    if (isMobileBreakpoint() && !isMobileExpanded) expandMobilePanel();
  });

  // ── Resize ───────────────────────────────────────────────────────────────
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
    const loaded = await loadRegions();
    state.regionIndex = loaded.regionIndex;
    state.pointCategories = loaded.pointCategories;
    state.availableIcons = new Set(loaded.availableIcons);
    state.regions = loaded.regions;

    populateRegionSelect();

    const savedRegion = localStorage.getItem('gbi-last-region');
    if (savedRegion && state.regions[savedRegion]) {
      state.currentRegion = savedRegion;
    } else if (!state.regions[state.currentRegion]) {
      state.currentRegion = getSelectableRegionEntries()[0]?.[0] ?? '';
    }

    // Shared options for both list controllers.
    const sharedListOptions = {
      getRegions,
      getCurrentRegion,
      getPointCategories,
      getCategoryMeta,
      getPointIcon,
      onPoiSelect: poi => {
        const targetZoom = Math.min(mapView.map.getMaxZoom(), 0);
        mapView.map.setView(poi.coords, targetZoom, { animate: true });
        const markerEntry = markerController.getMarkerEntryForPoint(poi);
        if (markerEntry) markerController.openPopupFromEntry(markerEntry);
        if (isMobileBreakpoint()) collapseMobilePanel();
      },
    };

    listController = createListModeController({
      ...sharedListOptions,
      listEl: elements.poiList,
    });

    bindEvents();
    settingsController.sync();
    mapView.map.invalidateSize();
    elements.regionSelect.value = state.currentRegion;
    resetJsonCopyButtonLabel();
    switchRegion(state.currentRegion);
    switchMode('search');
  } catch (error) {
    console.error(error);
  }
}

boot();
