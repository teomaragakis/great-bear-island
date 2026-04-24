// Edit-mode POI editing, JSON export, and temporary marker tooling.
import { EDIT_MODE_MAX_ZOOM, VIEW_MODE_MAX_ZOOM } from '../config/constants.js';
import { formatPoiJson, serializePointForJson } from '../data/loadRegions.js';
import { createEditPoiForm } from './editPoiForm.js';

export function createEditModeController({
  map,
  mapView,
  elements,
  getRegions,
  getRegionIndex,
  getCurrentRegion,
  getPointCategories,
  getCategoryMeta,
  markerController,
  onChange = () => {},
  onEditOpen = () => {},
}) {
  let editModeEnabled = false;
  let temporaryMarkers = [];
  let editViewButton = null;
  let activeEditEntry = null;
  let lastTemporaryPointConfig = {
    category: 'navigation',
    type: 'waterfall',
  };

  const {
    editPoiPanel,
    editPoiForm,
    jsonModal,
    jsonModalContent,
  } = elements;

  function isEditModeEnabled() {
    return editModeEnabled;
  }

  function setEditPanelContent(content = null, focusSelector = '') {
    editPoiForm.innerHTML = '';
    if (content) {
      // Reopening the form after rerenders should keep the active editor visible and focused.
      editPoiForm.appendChild(content);
      editPoiPanel.hidden = false;
      const targetField = (
        focusSelector
          ? editPoiForm.querySelector(focusSelector)
          : editPoiForm.querySelector('input:not([hidden]), select:not([hidden]), textarea:not([hidden])')
      );
      targetField?.focus();
      requestAnimationFrame(() => {
        editPoiPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      return;
    }

    editPoiPanel.hidden = true;
  }

  function syncEditControls() {
    if (!editViewButton) return;
    editViewButton.classList.toggle('visible', editModeEnabled);
  }

  function hideEditEditor() {
    activeEditEntry = null;
    setEditPanelContent();
  }

  function getCurrentPoisSnapshot() {
    // Export/copy includes persisted POIs plus unsaved temporary markers.
    return [
      ...getRegions()[getCurrentRegion()].pois.map(serializePointForJson),
      ...temporaryMarkers.map(({ point }) => serializePointForJson(point)),
    ];
  }

  function downloadJsonFile(payload, filename) {
    const blob = new Blob([formatPoiJson(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportCurrentPoisSnapshot() {
    const currentRegion = getCurrentRegion();
    const regionPath = getRegionIndex()[currentRegion]?.path ?? `${currentRegion}.json`;
    const filename = regionPath.split('/').pop() || `${currentRegion}.json`;
    downloadJsonFile(getCurrentPoisSnapshot(), filename);
  }

  async function copyCurrentPoisSnapshot() {
    await navigator.clipboard.writeText(jsonModalContent.textContent);
  }

  function openJsonModal() {
    jsonModalContent.textContent = formatPoiJson(getCurrentPoisSnapshot());
    jsonModal.hidden = false;
  }

  function closeJsonModal() {
    jsonModal.hidden = true;
  }

  function rememberPointConfig(point) {
    lastTemporaryPointConfig = {
      category: point.category,
      type: point.type,
    };
  }

  function getEntryPoint(entry) {
    return entry?.point ?? entry?.poi ?? null;
  }

  function isTemporaryEntry(entry) {
    const point = getEntryPoint(entry);
    return temporaryMarkers.some(candidate => candidate === entry || candidate.point === point || candidate.marker === entry?.marker);
  }

  function syncEntryMarkerVisual(entry) {
    const point = entry.point ?? entry.poi;
    if (!point) return;

    // Rebuild marker HTML from scratch so icon/category styling stays in sync with form edits.
    const nextMarkerElement = markerController.createMarkerElement(
      point,
      isTemporaryEntry(entry) ? 'temporary-marker' : '',
    );

    entry.el.className = nextMarkerElement.className;
    entry.el.style.cssText = nextMarkerElement.style.cssText;
    entry.el.innerHTML = nextMarkerElement.innerHTML;
    if (nextMarkerElement.dataset.poiId) entry.el.dataset.poiId = nextMarkerElement.dataset.poiId;
    else delete entry.el.dataset.poiId;
  }

  function sanitizeTemporaryPoint(point) {
    const category = getCategoryMeta(point.category);
    const type = category?.types?.[point.type] ?? null;

    const hideName = type?.name === false || (type?.name !== true && category?.name === false);
    const hideDesc = type?.desc === false || (type?.desc !== true && category?.desc === false);

    if (hideName) {
      delete point.name;
    }
    if (hideDesc) {
      delete point.desc;
    }
  }

  function openEditEditor(entry, options = {}) {
    // Existing markers use `poi`; temporary markers use `point`.
    const normalizedEntry = {
      ...entry,
      point: entry.point ?? entry.poi,
    };
    activeEditEntry = normalizedEntry;
    onEditOpen(normalizedEntry);
    setEditPanelContent(createEditPoiForm({
      entry: normalizedEntry,
      getPointCategories,
      getCategoryMeta,
      getRegionIndex,
      getCurrentRegion,
      syncEntryMarkerVisual,
      rememberPointConfig,
      openEditEditor,
      deleteEditEntry,
      refreshPopup: targetEntry => markerController.refreshPopup(targetEntry),
    }), options.focusSelector ?? '');
  }

  function updateEditPointPosition(entry) {
    markerController.refreshPopup(entry);
    if (getEntryPoint(activeEditEntry) === getEntryPoint(entry)) {
      openEditEditor(entry);
    }
  }

  function deleteEditEntry(entry) {
    markerController.closeCurrentPopup();
    if (isTemporaryEntry(entry)) {
      const point = getEntryPoint(entry);
      const temporaryEntry = temporaryMarkers.find(candidate => candidate === entry || candidate.point === point || candidate.marker === entry?.marker);
      if (temporaryEntry) {
        map.removeLayer(temporaryEntry.marker);
        temporaryMarkers = temporaryMarkers.filter(candidate => candidate !== temporaryEntry);
      }
    } else {
      // Saved POIs live in the current region data array and need a full marker rebuild after removal.
      const currentRegion = getCurrentRegion();
      const currentPois = getRegions()[currentRegion].pois;
      const point = getEntryPoint(entry);
      getRegions()[currentRegion].pois = currentPois.filter(candidate => candidate !== point);
      markerController.buildMarkers(currentRegion);
      onChange();
    }

    if (getEntryPoint(activeEditEntry) === getEntryPoint(entry)) {
      activeEditEntry = null;
      setEditPanelContent();
    }

    syncEditControls();
  }

  function deleteActiveEntry() {
    if (!activeEditEntry) return;
    deleteEditEntry(activeEditEntry);
  }

  function clearEditPointers() {
    temporaryMarkers.forEach(({ marker }) => map.removeLayer(marker));
    temporaryMarkers = [];
    activeEditEntry = null;
    setEditPanelContent();
    syncEditControls();
  }

  function setTemporaryMarkersVisible(visible) {
    // Temporary markers obey Hide all / Show all separately from persisted POI markers.
    temporaryMarkers.forEach(({ marker }) => {
      const isOnMap = map.hasLayer(marker);
      if (visible && !isOnMap) {
        marker.addTo(map);
        markerController.setMarkerDragState(marker, editModeEnabled);
      }

      if (!visible && isOnMap) {
        map.removeLayer(marker);
      }
    });
  }

  function onTemporaryMarkerClick(entry) {
    console.debug('Temporary POI clicked', {
      point: serializePointForJson(entry.point),
      editModeEnabled,
      latlng: entry.marker.getLatLng(),
    });

    markerController.openPopupFromEntry(entry, entry.el);

    if (editModeEnabled) {
      openEditEditor(entry);
    }
  }

  function createEditToggleControl() {
    return L.Control.extend({
      options: {
        position: 'bottomleft',
      },
      onAdd() {
        const container = L.DomUtil.create('div', 'leaflet-bar edit-controls');
        const toggleButton = L.DomUtil.create('button', 'edit-toggle', container);
        const viewButton = L.DomUtil.create('button', 'edit-view', container);
        toggleButton.type = 'button';
        toggleButton.textContent = '✎';
        toggleButton.setAttribute('aria-pressed', 'false');
        toggleButton.setAttribute('aria-label', 'Toggle edit mode');
        viewButton.type = 'button';
        viewButton.textContent = 'View JSON';
        viewButton.setAttribute('aria-label', 'View current POIs JSON');
        editViewButton = viewButton;
        syncEditControls();

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.on(toggleButton, 'click', () => {
          // Preserve the currently selected POI across the marker rebuild done for edit mode.
          const selectedPoi = markerController.getActiveViewPoi();
          editModeEnabled = !editModeEnabled;
          toggleButton.classList.toggle('active', editModeEnabled);
          toggleButton.setAttribute('aria-pressed', String(editModeEnabled));
          mapView.setMaxZoom(editModeEnabled ? EDIT_MODE_MAX_ZOOM : VIEW_MODE_MAX_ZOOM);
          syncEditControls();
          markerController.closeCurrentPopup();
          markerController.buildMarkers(getCurrentRegion());
          markerController.setAllMarkerDragState(editModeEnabled);
          temporaryMarkers.forEach(({ marker }) => markerController.setMarkerDragState(marker, editModeEnabled));

          if (editModeEnabled && selectedPoi) {
            const entry = markerController.getMarkerEntryForPoint(selectedPoi)
              ?? temporaryMarkers.find(candidate => candidate.point === selectedPoi);

            if (entry) {
              markerController.openPopupFromEntry(entry);
              openEditEditor(entry);
            }
          } else if (editModeEnabled) {
            markerController.refreshActivePopupContent();
          }

          if (!editModeEnabled) {
            hideEditEditor();
          }
        });
        L.DomEvent.on(viewButton, 'click', openJsonModal);

        return container;
      },
    });
  }

  function addTemporaryMarker(latlng) {
    const { x, y } = markerController.getPixelCoords(latlng);
    const point = {
      category: lastTemporaryPointConfig.category,
      type: lastTemporaryPointConfig.type,
      name: '',
      desc: '',
      pixelCoords: [x, y],
    };
    // New temporary POIs inherit the last selected category/type so repeated entry is faster.
    sanitizeTemporaryPoint(point);
    rememberPointConfig(point);

    const markerElement = markerController.createMarkerElement(point, 'temporary-marker');
    const editMarker = L.marker(latlng, {
      icon: L.divIcon({
        className: 'poi-div-icon',
        html: markerElement,
        iconSize: [32, 38],
        iconAnchor: [16, 38],
        popupAnchor: [0, -38],
      }),
      keyboard: false,
      draggable: editModeEnabled,
    }).addTo(map);

    const entry = { marker: editMarker, point, el: markerElement };
    editMarker.on('click', event => {
      if (event.originalEvent) {
        L.DomEvent.stop(event.originalEvent);
      }
      onTemporaryMarkerClick(entry);
    });
    editMarker.on('dragstart', markerController.closeCurrentPopup);
    editMarker.on('dragend', () => {
      markerController.applyPixelCoordsToPoint(entry.point, editMarker.getLatLng());
      updateEditPointPosition(entry);
      markerController.openPopupFromEntry(entry, markerElement);
    });

    temporaryMarkers.push(entry);
    syncEditControls();
    openEditEditor(entry);
    markerController.openPopupFromEntry(entry, entry.el);
  }

  function onExistingPointMoved(entry) {
    updateEditPointPosition(entry);
  }

  function installControl() {
    const Control = createEditToggleControl();
    map.addControl(new Control());
  }

  function setEditMode(enabled) {
    if (editModeEnabled === enabled) return;

    const selectedPoi = markerController.getActiveViewPoi();
    editModeEnabled = enabled;
    mapView.setMaxZoom(editModeEnabled ? EDIT_MODE_MAX_ZOOM : VIEW_MODE_MAX_ZOOM);
    syncEditControls();
    markerController.closeCurrentPopup();
    markerController.buildMarkers(getCurrentRegion());
    markerController.setAllMarkerDragState(editModeEnabled);
    temporaryMarkers.forEach(({ marker }) => markerController.setMarkerDragState(marker, editModeEnabled));

    if (editModeEnabled && selectedPoi) {
      const entry = markerController.getMarkerEntryForPoint(selectedPoi)
        ?? temporaryMarkers.find(candidate => candidate.point === selectedPoi);
      if (entry) {
        markerController.openPopupFromEntry(entry);
        openEditEditor(entry);
      }
    } else if (editModeEnabled) {
      markerController.refreshActivePopupContent();
    }

    if (!editModeEnabled) {
      hideEditEditor();
    }
  }

  return {
    installControl,
    isEditModeEnabled,
    setEditMode,
    openEditEditor,
    hideEditEditor,
    onExistingPointMoved,
    addTemporaryMarker,
    setTemporaryMarkersVisible,
    openJsonModal,
    closeJsonModal,
    exportCurrentPoisSnapshot,
    copyCurrentPoisSnapshot,
    clearEditPointers,
    deleteActiveEntry,
  };
}
