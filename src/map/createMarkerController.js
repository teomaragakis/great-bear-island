import { px, serializePointForJson } from '../data/loadAreas.js';
import { getFilterKey } from '../ui/createLegendController.js';

export function createMarkerController({
  map,
  getAreas,
  getCurrentArea,
  getActiveFilters,
  getCategoryMeta,
  getSubcategoryMeta,
  getPointIcon,
  isDeveloperModeEnabled,
  onOpenDeveloperEditor,
  onDeveloperPointMoved,
}) {
  let activeMarkers = [];
  let currentPopup = null;
  let activeMarkerEl = null;
  let activeViewPoi = null;

  function getPixelCoords(latlng) {
    return {
      x: Math.round(latlng.lng),
      y: Math.round(latlng.lat),
    };
  }

  function applyPixelCoordsToPoint(point, latlng) {
    const { x, y } = getPixelCoords(latlng);
    point.pixelCoords = [x, y];
    point.coords = px(x, y);
  }

  function createMarkerElement(point, extraClassName = '') {
    const category = getCategoryMeta(point.category);
    const el = document.createElement('div');
    el.className = `custom-marker${extraClassName ? ` ${extraClassName}` : ''}`;
    el.style.background = category.color;
    el.innerHTML = `<div class="marker-icon">${getPointIcon(point.category, point.subcategory)}</div>`;
    if (point.id) el.dataset.poiId = point.id;
    return el;
  }

  function getPopupContent(point) {
    const category = getCategoryMeta(point.category);
    const subcategory = getSubcategoryMeta(point.category, point.subcategory);
    const pointIcon = getPointIcon(point.category, point.subcategory);
    const popupTitle = point.name || subcategory?.label || category.label;
    const titleHtml = `
      <div class="popup-title-row">
        <span class="popup-title-icon">${pointIcon}</span>
        <div class="popup-title">${popupTitle}</div>
      </div>
    `;
    const coordsHtml = isDeveloperModeEnabled()
      ? `<div class="popup-coordinates">x: ${point.pixelCoords[0]}, y: ${point.pixelCoords[1]}</div>`
      : '';

    return `
      <div class="popup-cat" style="color:${category.color}">${category.label}</div>
      ${titleHtml}
      <div class="popup-desc">${point.desc}</div>
      ${coordsHtml}
    `;
  }

  function openPopupForPoint(point, latlng, activeEl = null) {
    if (currentPopup) {
      map.closePopup(currentPopup);
      currentPopup = null;
    }

    if (activeEl) {
      if (activeMarkerEl && activeMarkerEl !== activeEl) {
        activeMarkerEl.classList.remove('active-marker');
      }
      activeMarkerEl = activeEl;
      activeMarkerEl.classList.add('active-marker');
    }

    currentPopup = L.popup({
      offset: [0, -20],
      closeButton: true,
      autoClose: false,
      closeOnClick: false,
      className: 'poi-popup',
      maxWidth: 280,
    })
      .setLatLng(latlng)
      .setContent(getPopupContent(point));

    currentPopup.on('remove', () => {
      if (activeEl) {
        activeEl.classList.remove('active-marker');
      }
      if (activeMarkerEl === activeEl) {
        activeMarkerEl = null;
      }
    });

    currentPopup.openOn(map);
    return currentPopup;
  }

  function closePopupForDrag() {
    if (!currentPopup) return;
    map.closePopup(currentPopup);
    currentPopup = null;
  }

  function reopenPopupAfterDrag(entry, activeEl = null) {
    currentPopup = openPopupForPoint(entry.point, entry.marker.getLatLng(), activeEl);
  }

  function refreshPopup(entry) {
    if (currentPopup) {
      currentPopup.setContent(getPopupContent(entry.point));
      currentPopup.setLatLng(entry.marker.getLatLng());
    }
  }

  function setMarkerDragState(marker, enabled) {
    if (!marker.dragging) return;
    if (enabled) marker.dragging.enable();
    else marker.dragging.disable();
  }

  function clearMarkers() {
    activeMarkers.forEach(({ marker }) => marker.remove());
    activeMarkers = [];
    activeMarkerEl = null;
  }

  function buildMarkers(areaKey = getCurrentArea()) {
    clearMarkers();
    const pois = getAreas()[areaKey].pois;

    pois.forEach(poi => {
      const category = getCategoryMeta(poi.category);
      if (!category) return;

      const el = createMarkerElement(poi);
      const marker = L.marker(poi.coords, {
        icon: L.divIcon({
          className: 'poi-div-icon',
          html: el,
          iconSize: [28, 28],
          iconAnchor: [14, 28],
          popupAnchor: [0, -28],
        }),
        keyboard: false,
        draggable: isDeveloperModeEnabled(),
      }).addTo(map);

      setMarkerDragState(marker, isDeveloperModeEnabled());

      marker.on('click', event => {
        if (event.originalEvent) L.DomEvent.stop(event.originalEvent);

        const cat = getCategoryMeta(poi.category);
        const subcat = getSubcategoryMeta(poi.category, poi.subcategory);
        console.debug('POI clicked', {
          point: serializePointForJson(poi),
          developerModeEnabled: isDeveloperModeEnabled(),
          categoryLabel: cat?.label ?? null,
          subcategoryLabel: subcat?.label ?? null,
          latlng: marker.getLatLng(),
        });

        activeViewPoi = poi;
        currentPopup = openPopupForPoint(poi, poi.coords, el);

        if (isDeveloperModeEnabled()) {
          onOpenDeveloperEditor({ marker, point: poi, el });
        }
      });

      marker.on('dragstart', closePopupForDrag);
      marker.on('dragend', () => {
        const entry = { marker, point: poi, el };
        applyPixelCoordsToPoint(entry.point, marker.getLatLng());
        onDeveloperPointMoved(entry);
        reopenPopupAfterDrag(entry, el);
      });

      activeMarkers.push({ marker, el, poi });
    });

    refreshMarkerVisibility();
  }

  function refreshMarkerVisibility() {
    const activeFilters = getActiveFilters();
    activeMarkers.forEach(({ marker, poi }) => {
      const isVisible = activeFilters.has(getFilterKey(poi.category, poi.subcategory));
      const isOnMap = map.hasLayer(marker);

      if (isVisible && !isOnMap) {
        marker.addTo(map);
      }

      if (!isVisible && isOnMap) {
        marker.remove();
      }
    });
  }

  function setAllMarkerDragState(enabled) {
    activeMarkers.forEach(({ marker }) => setMarkerDragState(marker, enabled));
  }

  function closeCurrentPopup() {
    if (!currentPopup) return;
    map.closePopup(currentPopup);
    currentPopup = null;
  }

  function getMarkerEntryForPoint(point) {
    return activeMarkers.find(entry => entry.poi === point) ?? null;
  }

  function refreshActivePopupContent() {
    if (!currentPopup || !activeViewPoi) return;
    currentPopup.setContent(getPopupContent(activeViewPoi));
  }

  function openPopupFromEntry(entry, activeEl = entry.el ?? null) {
    currentPopup = openPopupForPoint(entry.point, entry.marker.getLatLng(), activeEl);
  }

  function getCurrentPopup() {
    return currentPopup;
  }

  function getActiveViewPoi() {
    return activeViewPoi;
  }

  return {
    buildMarkers,
    refreshMarkerVisibility,
    setAllMarkerDragState,
    closeCurrentPopup,
    closePopupForDrag,
    refreshPopup,
    getMarkerEntryForPoint,
    refreshActivePopupContent,
    openPopupFromEntry,
    createMarkerElement,
    getPixelCoords,
    applyPixelCoordsToPoint,
    setMarkerDragState,
    getCurrentPopup,
    getActiveViewPoi,
  };
}
