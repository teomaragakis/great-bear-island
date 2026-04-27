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
  editHintSection: document.getElementById('edit-hint-section'),
  editHintToggle: document.getElementById('edit-hint-toggle'),
  poiSearch: document.getElementById('poi-filter'),
  poiSearchClear: document.getElementById('poi-filter-clear'),
  editPoiSearch: document.getElementById('edit-poi-filter'),
  editPoiSearchClear: document.getElementById('edit-poi-filter-clear'),
  leftSearchWrap: document.getElementById('left-search-wrap'),
  leftSearchInput: document.getElementById('left-search-input'),
  leftSearchClear: document.getElementById('left-search-clear'),
  leftSearchTags: document.getElementById('left-search-tags'),
  leftSearchTagsWrap: document.getElementById('left-search-tags-wrap'),
  leftSearchTagsScrollLeft: document.getElementById('left-search-tags-scroll-left'),
  leftSearchTagsScrollRight: document.getElementById('left-search-tags-scroll-right'),
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
  jsonModalControl: document.querySelector('.left-json-control'),
  jsonModal: document.getElementById('json-modal'),
  jsonModalContent: document.getElementById('json-modal-content'),
  jsonModalClose: document.getElementById('json-modal-close'),
  jsonModalCopy: document.getElementById('json-modal-copy'),
  jsonModalExport: document.getElementById('json-modal-export'),
  jsonModalBackdrop: document.querySelector('[data-close-json-modal]'),
  jsonModalTrigger: document.getElementById('json-modal-trigger'),
  editPoiDelete: document.getElementById('edit-poi-delete'),
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
  layerButtons: document.querySelectorAll('.panel-mode-tab[data-layer]'),
  // Panel UI
  panel: document.getElementById('legend-panel'),
  panelToggleBtn: document.getElementById('panel-toggle-btn'),
  mobileLegendToggle: document.getElementById('mobile-legend-toggle'),
  panelBackdrop: document.getElementById('panel-backdrop'),
  panelDragHandle: document.getElementById('panel-drag-handle'),
  panelModeTabs: document.querySelectorAll('.panel-mode-tab[data-mode]'),
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
  poiPanelWrapper: document.getElementById('panel-wrapper'),
  poiInfoPanel: document.getElementById('poi-info-panel'),
  poiInfoIcon: document.getElementById('poi-info-icon'),
  poiInfoKicker: document.getElementById('poi-info-kicker'),
  poiInfoName: document.getElementById('poi-info-name'),
  poiInfoContent: document.getElementById('poi-info-content'),
  poiInfoFooter: document.getElementById('poi-info-footer'),
  poiInfoCount: document.getElementById('poi-info-count'),
  poiInfoLink: document.getElementById('poi-info-link'),
  poiInfoId: document.getElementById('poi-info-id'),
  poiInfoDlcTag: document.getElementById('poi-info-dlc-tag'),
  poiInfoBackBtn: document.getElementById('poi-info-back-btn'),
  poiInfoCloseBtn: document.getElementById('poi-info-close-btn'),
};

// ── Panel / mode state ──────────────────────────────────────────────────────
let currentMode = 'explore';    // 'explore' | 'search' | 'edit'
let isPanelOpen = true;
let isMobileExpanded = false;
let listController = null;      // search pane — important POIs only
let savedExploreFilters = null; // filters saved when entering search mode
let pendingRegionSwitchAction = null;
let searchGroupPanelItem = null; // group item to return to when hitting back

function isMobileBreakpoint() {
  return window.matchMedia('(max-width: 640px)').matches;
}

// ── Legend panel open / close ────────────────────────────────────────────────
function syncLegendPanelControls(open) {
  const expanded = String(open);
  elements.panelToggleBtn.setAttribute('aria-expanded', expanded);
  elements.mobileLegendToggle.setAttribute('aria-expanded', expanded);
}

function setLegendPanelOpen(open) {
  if (isMobileBreakpoint()) {
    isMobileExpanded = open;
    isPanelOpen = open;
    elements.panel.classList.toggle('panel-hidden', !open);
    elements.panel.classList.toggle('panel-expanded', open);
    elements.panelToggleBtn.innerHTML = '✕';
    elements.panelBackdrop.hidden = !open;
    syncLegendPanelControls(open);
    mapView.map.invalidateSize();
    return;
  }

  isPanelOpen = open;
  isMobileExpanded = false;
  elements.panel.classList.toggle('panel-hidden', !open);
  elements.panel.classList.remove('panel-expanded');
  elements.panelBackdrop.hidden = true;
  elements.panelToggleBtn.innerHTML = open
    ? '✕'
    : '<img src="assets/icons/ui/legend.svg" alt="" aria-hidden="true" />';
  syncLegendPanelControls(open);
  mapView.map.invalidateSize();
}

function toggleLegendPanel() {
  setLegendPanelOpen(isMobileBreakpoint() ? !isMobileExpanded : !isPanelOpen);
}

// ── Mode switching ───────────────────────────────────────────────────────────
function switchMode(mode, { focus = true } = {}) {
  const prevMode = currentMode;

  if (mode === currentMode) {
    // On mobile, re-tapping the active mode tab expands the panel.
    if (isMobileBreakpoint() && !isMobileExpanded) setLegendPanelOpen(true);
    return;
  }

  currentMode = mode;
  document.body.dataset.mode = mode;

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
  elements.jsonModalControl.hidden = mode !== 'edit';
  elements.leftSearchWrap.hidden = mode !== 'search';

  // Toggle edit mode on / off.
  if (mode === 'edit') {
    elements.poiInfoLink.hidden = true;
    const poiToEdit = markerController.getActiveViewPoi();
    editMode.setEditMode(true);
    if (poiToEdit) {
      const entry = markerController.getMarkerEntryForPoint(poiToEdit);
      if (entry) {
        showEditInfoPanel(entry);
      }
    }
  } else if (prevMode === 'edit') {
    const poiToRestore = markerController.getActiveViewPoi();
    editMode.setEditMode(false);
    elements.panelPanePoiInfo.hidden = false;
    elements.panelPanePoiEdit.hidden = true;
    if (poiToRestore) {
      showPoiInfoPanel(poiToRestore);
    }
  }

  // Search mode uses important-only filters; restore on exit.
  if (mode === 'search') {
    savedExploreFilters = new Set(state.activeTypeFilters);
    state.activeTypeFilters = computeImportantFilterKeys(state.currentRegion);
    // Keep the currently open POI visible so the info panel stays open.
    const activePoi = markerController.getActiveViewPoi();
    if (activePoi) state.activeTypeFilters.add(getFilterKey(activePoi.category, activePoi.type));
    markerController.refreshMarkerVisibility();
    buildLeftSearchTags();
    if (focus) elements.leftSearchInput.focus();
  } else if (prevMode === 'search' && savedExploreFilters) {
    state.activeTypeFilters = savedExploreFilters;
    savedExploreFilters = null;
    markerController.refreshMarkerVisibility();
  }

  buildLegendForCurrentMode();

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

function getImportantSearchTags(regionKey) {
  const pois = state.regions[regionKey]?.pois ?? [];
  const tags = [];
  const seen = new Set();

  pois.forEach(poi => {
    const categoryMeta = getCategoryMeta(poi.category);
    const typeMeta = categoryMeta?.types?.[poi.type];

    if (categoryMeta?.important === true) {
      const key = `category:${poi.category}`;
      if (!seen.has(key)) {
        seen.add(key);
        const categoryTypeKeys = new Set(Object.keys(categoryMeta.types ?? {}));
        const matchingPois = pois.filter(regionPoi => (
          regionPoi.category === poi.category
          || (Array.isArray(regionPoi.contents) && regionPoi.contents.some(typeKey => categoryTypeKeys.has(typeKey)))
        ));
        tags.push({
          key,
          kind: 'poi-group',
          group: 'Categories',
          categoryKey: poi.category,
          label: categoryMeta.label ?? poi.category,
          color: categoryMeta.color,
          iconHtml: getPointIcon(poi.category, matchingPois[0]?.type ?? poi.type, matchingPois[0] ?? poi),
          sublabel: state.regionIndex[regionKey]?.name ?? regionKey,
          matchCount: matchingPois.length,
          pois: matchingPois,
          regionKey,
        });
      }
    }

    if (typeMeta?.important === true) {
      const key = `type:${poi.category}:${poi.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        const matchingPois = pois.filter(regionPoi => (
          (regionPoi.category === poi.category && regionPoi.type === poi.type)
          || (Array.isArray(regionPoi.contents) && regionPoi.contents.includes(poi.type))
        ));
        tags.push({
          key,
          kind: 'poi-group',
          group: 'Types',
          categoryKey: poi.category,
          typeKey: poi.type,
          label: typeMeta.label ?? poi.type,
          color: typeMeta.color ?? categoryMeta?.color,
          iconHtml: getPointIcon(poi.category, poi.type, matchingPois[0] ?? poi),
          sublabel: categoryMeta.label ?? poi.category,
          matchCount: matchingPois.length,
          pois: matchingPois,
          regionKey,
        });
      }
    }
  });

  return tags;
}

function buildLeftSearchTags(regionKey = getCurrentRegion()) {
  if (!elements.leftSearchTags) return;

  const tags = getImportantSearchTags(regionKey);
  elements.leftSearchTags.innerHTML = '';

  tags.forEach(tag => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'left-search-tag';
    button.setAttribute('aria-label', `Search for ${tag.label}`);
    if (tag.color) button.style.setProperty('--tag-color', tag.color);
    button.innerHTML = `
      <span class="left-search-tag-dot" aria-hidden="true"></span>
      ${tag.iconHtml ? `<span class="left-search-tag-icon">${tag.iconHtml}</span>` : ''}
      <span>${tag.label}</span>
    `;
    button.addEventListener('click', () => {
      handleSearchSelection(tag);
    });
    elements.leftSearchTags.appendChild(button);
  });

  window.requestAnimationFrame(updateLeftSearchTagScrollControls);
}

function updateLeftSearchTagScrollControls() {
  const tagsEl = elements.leftSearchTags;
  if (!tagsEl || !elements.leftSearchTagsScrollLeft || !elements.leftSearchTagsScrollRight) return;

  const hasOverflow = tagsEl.scrollWidth > tagsEl.clientWidth + 1;
  const atStart = tagsEl.scrollLeft <= 1;
  const atEnd = tagsEl.scrollLeft + tagsEl.clientWidth >= tagsEl.scrollWidth - 1;

  elements.leftSearchTagsScrollLeft.hidden = !hasOverflow || atStart;
  elements.leftSearchTagsScrollRight.hidden = !hasOverflow || atEnd;
  elements.leftSearchTagsWrap?.classList.toggle('has-overflow', hasOverflow);
}

function scrollLeftSearchTags(direction) {
  const tagsEl = elements.leftSearchTags;
  if (!tagsEl) return;

  tagsEl.scrollBy({
    left: direction * Math.max(160, tagsEl.clientWidth * 0.7),
    behavior: 'smooth',
  });
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

      const targetRegionName = state.regionIndex[transitionPoi.transition]?.name ?? transitionPoi.transition;
      openRegionSwitchModal(`Navigate to the transition point to ${targetRegionName}?`, () => {
        closeRegionInfoModal();
        const targetZoom = Math.min(mapView.map.getMaxZoom(), 0);
        mapView.map.setView(transitionPoi.coords, targetZoom, { animate: true });
        const markerEntry = markerController.getMarkerEntryForPoint(transitionPoi);
        if (markerEntry) markerController.openPopupFromEntry(markerEntry);
      });
    });
  });
}

const mapView = createMapView(getCurrentRegion, regionKey => state.regions[regionKey]);

function poiDisplayName(point, fallbackType, fallbackCategory) {
  const base = point.name || fallbackType?.label || fallbackCategory?.label || '';
  return point.number != null ? `${base} #${point.number}` : base;
}

function setPoiInfoFooter(url, count = null) {
  elements.editPoiDelete.hidden = true;
  elements.poiInfoLink.href = url ?? '';
  elements.poiInfoLink.hidden = !url || currentMode === 'edit';
  elements.poiInfoCount.hidden = count == null;
  elements.poiInfoCount.textContent = count != null ? `${count} ${count === 1 ? 'item' : 'items'}` : '';
  elements.poiInfoFooter.hidden = !url && count == null;
}

function showEditInfoPanel(entry) {
  const point = entry.point ?? entry.poi;
  const category = getCategoryMeta(point.category);
  const type = getTypeMeta(point.category, point.type);
  elements.poiInfoIcon.style.setProperty('--poi-icon-bg', type?.color ?? category.color);
  elements.poiInfoIcon.innerHTML = getPointIcon(point.category, point.type, point);
  elements.poiInfoKicker.textContent = category.label;
  elements.poiInfoKicker.style.color = category.color;
  elements.poiInfoName.textContent = poiDisplayName(point, type, category);
  elements.poiInfoId.textContent = point.id ?? '';
  elements.poiInfoId.hidden = !point.id;
  elements.panelPanePoiInfo.hidden = true;
  elements.panelPanePoiEdit.hidden = false;
  elements.poiInfoCount.hidden = true;
  elements.poiInfoLink.hidden = true;
  elements.editPoiDelete.hidden = false;
  elements.poiInfoFooter.hidden = false;
  elements.poiPanelWrapper.classList.add('panel-visible');
}

function showLocationInfoPanel(location, regionName = '') {
  searchGroupPanelItem = null;
  setCloseBtn('close');
  elements.panelPanePoiInfo.hidden = false;
  elements.panelPanePoiEdit.hidden = true;
  elements.poiInfoIcon.style.setProperty('--poi-icon-bg', '#6b7280');
  elements.poiInfoIcon.innerHTML = '<img src="assets/icons/ui/map.svg" alt="" aria-hidden="true" />';
  elements.poiInfoKicker.textContent = regionName ? `Location in ${regionName}` : 'Location';
  elements.poiInfoKicker.style.color = '';
  elements.poiInfoName.textContent = location.name;
  elements.poiInfoDlcTag.hidden = true;
  elements.poiInfoId.hidden = true;
  animateInfoPanelHeight(() => {
    elements.poiInfoContent.innerHTML = '';
    if (location.info) {
      const s = document.createElement('section');
      s.className = 'panel-section';
      s.innerHTML = `<div class="info-item"><div class="popup-label">Description</div><div class="info-item-value">${location.info}</div></div>`;
      elements.poiInfoContent.appendChild(s);
    }
    setPoiInfoFooter(location.url);
  });
  elements.poiPanelWrapper.classList.add('panel-visible');
}

function showSearchGroupInfoPanel(item) {
  searchGroupPanelItem = null;
  setCloseBtn('close');
  elements.panelPanePoiInfo.hidden = false;
  elements.panelPanePoiEdit.hidden = true;
  elements.poiInfoIcon.style.setProperty('--poi-icon-bg', item.color ?? '#6b7280');
  elements.poiInfoIcon.innerHTML = item.iconHtml ?? '';
  elements.poiInfoKicker.textContent = item.group === 'Types' ? (item.sublabel ?? item.group) : item.group;
  elements.poiInfoKicker.style.color = item.color ?? '';
  elements.poiInfoName.textContent = item.label;
  elements.poiInfoDlcTag.hidden = true;
  elements.poiInfoId.hidden = true;

  animateInfoPanelHeight(() => {
    elements.poiInfoContent.innerHTML = '';

    if (item.group === 'Types' && item.categoryKey && item.typeKey) {
      const typeInfo = getTypeMeta(item.categoryKey, item.typeKey)?.info ?? '';
      if (typeInfo) {
        const infoSection = document.createElement('section');
        infoSection.className = 'panel-section';
        infoSection.innerHTML = `<div class="info-item"><div class="popup-label">Info</div><div class="info-item-value">${typeInfo}</div></div>`;
        elements.poiInfoContent.appendChild(infoSection);
      }
    }

    const group = document.createElement('div');
    group.className = 'legend-group';

    const header = document.createElement('div');
    header.className = 'legend-group-header';

    const title = document.createElement('button');
    title.type = 'button';
    title.className = 'legend-group-title';
    title.setAttribute('aria-label', 'Toggle points of interest group');

    const heading = document.createElement('h3');
    heading.textContent = 'Points of interest';
    title.appendChild(heading);

    const collapseToggle = document.createElement('span');
    collapseToggle.className = 'legend-group-collapse';
    collapseToggle.innerHTML = '<span class="legend-group-chevron" aria-hidden="true">▾</span>';
    title.appendChild(collapseToggle);
    header.appendChild(title);
    group.appendChild(header);

    const listOuter = document.createElement('div');
    listOuter.className = 'legend-group-items-outer';
    const list = document.createElement('div');
    list.className = 'legend-group-items';
    listOuter.appendChild(list);

    title.addEventListener('click', () => {
      const collapsed = group.classList.toggle('collapsed');
      collapseToggle.innerHTML = `<span class="legend-group-chevron${collapsed ? ' collapsed' : ''}" aria-hidden="true">▾</span>`;
      title.setAttribute('aria-expanded', String(!collapsed));
    });

    item.pois.forEach(poi => {
      const cat = getCategoryMeta(poi.category);
      const type = getTypeMeta(poi.category, poi.type);
      const color = type?.color ?? cat?.color ?? '#888';
      const icon = getPointIcon(poi.category, poi.type, poi);
      const label = poi.name
        ? (poi.number != null ? `${poi.name} #${poi.number}` : poi.name)
        : (type?.label ?? poi.type);
      const idHtml = poi.id ? `<span class="poi-list-id">${poi.id}</span>` : '';

      const row = document.createElement('div');
      row.className = 'legend-item';
      row.setAttribute('role', 'button');
      row.tabIndex = 0;
      row.setAttribute('aria-label', `Open ${label}`);
      row.style.setProperty('--category-color', color);
      row.innerHTML = `<div class="legend-dot"></div><span class="legend-label">${icon} ${label}</span>${idHtml}`;
      const openPoi = () => {
        searchGroupPanelItem = item;
        setCloseBtn('back');
        const targetZoom = Math.min(mapView.map.getMaxZoom(), 0);
        mapView.map.setView(poi.coords, targetZoom, { animate: true });
        const markerEntry = markerController.getMarkerEntryForPoint(poi);
        if (markerEntry) markerController.openPopupFromEntry(markerEntry);
        if (isMobileBreakpoint()) setLegendPanelOpen(false);
      };
      row.addEventListener('click', openPoi);
      row.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openPoi();
      });
      list.appendChild(row);
    });

    group.appendChild(listOuter);
    const groupSection = document.createElement('section');
    groupSection.className = 'panel-section list-section';
    groupSection.appendChild(group);
    elements.poiInfoContent.appendChild(groupSection);
    const itemUrl = item.group === 'Types'
      ? (getTypeMeta(item.categoryKey, item.typeKey)?.url ?? null)
      : null;
    setPoiInfoFooter(itemUrl, item.pois.length);
  });
  elements.poiPanelWrapper.classList.add('panel-visible');
}

function showPoiInfoPanel(point) {
  if (!searchGroupPanelItem) setCloseBtn('close');
  elements.panelPanePoiInfo.hidden = false;
  elements.panelPanePoiEdit.hidden = true;
  const category = getCategoryMeta(point.category);
  const type = getTypeMeta(point.category, point.type);
  elements.poiInfoIcon.style.setProperty('--poi-icon-bg', type?.color ?? category.color);
  elements.poiInfoIcon.innerHTML = getPointIcon(point.category, point.type, point);
  elements.poiInfoKicker.textContent = category.label;
  elements.poiInfoKicker.style.color = category.color;
  elements.poiInfoName.textContent = poiDisplayName(point, type, category);
  elements.poiInfoDlcTag.hidden = type?.dlc !== true;
  elements.poiInfoId.hidden = true;
  const { contents, info } = markerController.getPoiInfoContent(point);
  animateInfoPanelHeight(() => {
    elements.poiInfoContent.innerHTML = '';
    if (contents) {
      const s = document.createElement('section');
      s.className = 'panel-section';
      s.innerHTML = contents;
      elements.poiInfoContent.appendChild(s);
    }
    if (info) {
      const s = document.createElement('section');
      s.className = 'panel-section';
      s.innerHTML = info;
      elements.poiInfoContent.appendChild(s);
    }
    setPoiInfoFooter(point.url ?? type?.url ?? null);
  });
  elements.poiPanelWrapper.classList.add('panel-visible');
}

function setCloseBtn(mode) {
  elements.poiInfoBackBtn.hidden = mode !== 'back';
}

function hidePoiInfoPanel() {
  searchGroupPanelItem = null;
  setCloseBtn('close');
  elements.poiPanelWrapper.classList.remove('panel-visible');
}

function animateInfoPanelHeight(updateFn) {
  const body = elements.poiInfoPanel.querySelector('.panel-body');
  if (!body || !elements.poiPanelWrapper.classList.contains('panel-visible')) {
    updateFn();
    return;
  }
  const from = body.offsetHeight;
  updateFn();
  const to = body.offsetHeight;
  if (from === to) return;
  body.style.overflow = 'hidden';
  body.style.transition = 'none';
  body.style.height = `${from}px`;
  void body.offsetHeight;
  body.style.transition = 'height 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
  body.style.height = `${to}px`;
  body.addEventListener('transitionend', () => {
    body.style.height = '';
    body.style.overflow = '';
    body.style.transition = '';
  }, { once: true });
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
  onBeforeEditDrag: () => editMode?.pushUndoSnapshot(),
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
  buildLeftSearchTags(regionKey);
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

function handleSearchSelection(item) {
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
      const validCoords = item.pois.map(p => p.coords).filter(Boolean);
      if (validCoords.length === 1 && item.pois.length === 1) {
        mapView.map.setView(validCoords[0], targetZoom, { animate: true });
        const markerEntry = markerController.getMarkerEntryForPoint(item.pois[0]);
        if (markerEntry) markerController.openPopupFromEntry(markerEntry);
      } else {
        if (validCoords.length > 1) {
          mapView.map.fitBounds(validCoords, { padding: [60, 60], animate: true });
        }
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
    if (isMobileBreakpoint()) setLegendPanelOpen(false);
  });
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
      elements.leftSearchClear.hidden = !elements.leftSearchInput.value;
      handleSearchSelection(item);
    },
  });

  // Left search clear button
  elements.leftSearchInput.addEventListener('input', () => {
    elements.leftSearchClear.hidden = !elements.leftSearchInput.value;
  });
  elements.leftSearchTags.addEventListener('scroll', updateLeftSearchTagScrollControls);
  elements.leftSearchTagsScrollLeft.addEventListener('click', () => scrollLeftSearchTags(-1));
  elements.leftSearchTagsScrollRight.addEventListener('click', () => scrollLeftSearchTags(1));
  elements.leftSearchClear.addEventListener('click', () => {
    elements.leftSearchInput.value = '';
    elements.leftSearchClear.hidden = true;
    elements.leftSearchInput.focus();
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
  elements.editPoiDelete.addEventListener('click', () => editMode.deleteActiveEntry());

  // Area info modal
  elements.regionInfoTrigger.addEventListener('click', openRegionInfoModal);
  elements.regionInfoModalClose.addEventListener('click', closeRegionInfoModal);
  elements.regionInfoModalBackdrop.addEventListener('click', closeRegionInfoModal);
  elements.regionSwitchModalClose.addEventListener('click', closeRegionSwitchModal);
  elements.regionSwitchModalCancel.addEventListener('click', closeRegionSwitchModal);
  elements.regionSwitchModalConfirm.addEventListener('click', confirmRegionSwitchModal);
  elements.regionSwitchModalBackdrop.addEventListener('click', closeRegionSwitchModal);

  // ── POI info panel close / back ─────────────────────────────────────────
  elements.poiInfoBackBtn.addEventListener('click', () => {
    const groupItem = searchGroupPanelItem;
    searchGroupPanelItem = null;
    setCloseBtn('close');
    markerController.closeCurrentPopup();
    showSearchGroupInfoPanel(groupItem);
  });

  elements.poiInfoCloseBtn.addEventListener('click', () => {
    markerController.closeCurrentPopup();
    editMode.hideEditEditor();
    elements.panelPanePoiInfo.hidden = false;
    elements.panelPanePoiEdit.hidden = true;
    hidePoiInfoPanel();
  });

  // ── Legend panel toggles ────────────────────────────────────────────────
  elements.panelToggleBtn.addEventListener('click', toggleLegendPanel);
  elements.mobileLegendToggle.addEventListener('click', toggleLegendPanel);

  // ── Mobile: drag handle tap expands / collapses ─────────────────────────
  elements.panelDragHandle.addEventListener('click', () => {
    toggleLegendPanel();
  });

  // ── Mobile: tap search input → expand panel ─────────────────────────────
  elements.poiSearch.addEventListener('focus', () => {
    if (isMobileBreakpoint() && !isMobileExpanded) setLegendPanelOpen(true);
  });

  // ── Backdrop tap collapses mobile panel ─────────────────────────────────
  elements.panelBackdrop.addEventListener('click', () => setLegendPanelOpen(false));

  // ── Edit hint toggle ────────────────────────────────────────────────────
  elements.editHintToggle.addEventListener('click', () => {
    const collapsed = elements.editHintSection.classList.toggle('collapsed');
    elements.editHintToggle.setAttribute('aria-expanded', String(!collapsed));
  });

  // ── Mode tabs (desktop) ─────────────────────────────────────────────────
  elements.panelModeTabs.forEach(tab => {
    tab.addEventListener('click', () => switchMode(tab.dataset.mode, { focus: false }));
  });

  // ── Mode nav (mobile) ───────────────────────────────────────────────────
  elements.mobileNavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchMode(btn.dataset.mode, { focus: false });
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
      if (isMobileExpanded) setLegendPanelOpen(false);
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
    if (isMobileBreakpoint() && !isMobileExpanded) setLegendPanelOpen(true);
  });

  // ── Resize ───────────────────────────────────────────────────────────────
  const mobileQuery = window.matchMedia('(max-width: 640px)');
  mobileQuery.addEventListener('change', e => {
    if (!e.matches) {
      // Crossed to desktop: re-sync button icon and remove mobile-only classes.
      elements.panel.classList.remove('panel-expanded');
      elements.panelBackdrop.hidden = true;
      elements.panelToggleBtn.innerHTML = isPanelOpen
        ? '✕'
        : '<img src="assets/icons/ui/legend.svg" alt="" aria-hidden="true" />';
      syncLegendPanelControls(isPanelOpen);
    }
  });

  window.addEventListener('resize', () => {
    mapView.map.invalidateSize();
    mapView.updateBounds();
    mapView.map.fitBounds(mapView.getCurrentRegionBounds(), {
      padding: [0, 0],
      animate: false,
    });
    updateLeftSearchTagScrollControls();
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
        if (isMobileBreakpoint()) setLegendPanelOpen(false);
      },
    };

    listController = createListModeController({
      ...sharedListOptions,
      listEl: elements.poiList,
    });

    bindEvents();
    settingsController.sync();
    mapView.map.invalidateSize();
    document.body.dataset.mode = currentMode;
    elements.regionSelect.value = state.currentRegion;
    resetJsonCopyButtonLabel();
    switchRegion(state.currentRegion);
    switchMode('search', { focus: false });
    if (isMobileBreakpoint()) setLegendPanelOpen(false);
  } catch (error) {
    console.error(error);
  }
}

boot();
