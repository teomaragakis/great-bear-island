// Marker lifecycle for POIs, popups, clustering, and region label overlays.
import { px, serializePointForJson } from '../data/loadAreas.js';
import { getFilterKey } from '../ui/createLegendController.js';

export function createMarkerController({
  map,
  getRegions,
  getRegionIndex,
  getCurrentRegion,
  getActiveFilters,
  getCategoryMeta,
  getTypeMeta,
  getPointIcon,
  shouldClusterMarkers,
  shouldClusterByCategory,
  isDeveloperModeEnabled,
  onOpenDeveloperEditor,
  onDeveloperPointMoved,
}) {
  let activeMarkers = [];
  let activeLocationLabels = [];
  let currentPopup = null;
  let activeMarkerEl = null;
  let activeViewPoi = null;
  let clusterLayers = new Map();

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
    el.style.setProperty('--category-color', category.color);
    el.innerHTML = `<div class="marker-icon">${getPointIcon(point.category, point.type, point)}</div>`;
    if (point.id) el.dataset.poiId = point.id;
    return el;
  }

  function getPopupContent(point) {
    // Popups fall back from POI-specific fields to the shared type metadata.
    const category = getCategoryMeta(point.category);
    const type = getTypeMeta(point.category, point.type);
    const pointIcon = getPointIcon(point.category, point.type, point);
    const popupTitle = point.name || type?.label || category.label;
    const popupDesc = point.desc ?? type?.desc ?? '';
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
      <div class="popup-desc">${popupDesc}</div>
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
    const point = entry.point ?? entry.poi;
    if (!point) return;
    currentPopup = openPopupForPoint(point, entry.marker.getLatLng(), activeEl);
  }

  function refreshPopup(entry) {
    const point = entry.point ?? entry.poi;
    if (!point) return;
    if (currentPopup) {
      currentPopup.setContent(getPopupContent(point));
      currentPopup.setLatLng(entry.marker.getLatLng());
    }
  }

  function setMarkerDragState(marker, enabled) {
    if (!marker.dragging) return;
    if (enabled) marker.dragging.enable();
    else marker.dragging.disable();
  }

  function clearLocationLabels() {
    activeLocationLabels.forEach(label => label.remove());
    activeLocationLabels = [];
  }

  function getLocationLatLng(location, pois) {
    if (Array.isArray(location.pixelCoords) && location.pixelCoords.length === 2) {
      return px(location.pixelCoords[0], location.pixelCoords[1]);
    }

    const matchedPoi = pois.find(poi => poi.name === location.name);
    return matchedPoi?.coords ?? null;
  }

  function buildLocationLabels(regionKey, pois) {
    clearLocationLabels();

    // Region labels are separate from POIs and come from the region metadata file.
    const locations = getRegionIndex()[regionKey]?.locations ?? [];
    locations.forEach(location => {
      const latlng = getLocationLatLng(location, pois);
      if (!latlng) return;

      const marker = L.marker(latlng, {
        interactive: true,
        keyboard: false,
        zIndexOffset: -100,
        icon: L.divIcon({
          className: 'region-location-label-icon',
          html: `<div class="region-location-label">${location.name}</div>`,
          iconSize: [0, 0],
        }),
      }).addTo(map);

      marker.on('click', event => {
        if (event.originalEvent) L.DomEvent.stop(event.originalEvent);

        const targetZoom = Math.min(map.getMaxZoom(), 0);

        map.setView(latlng, targetZoom, {
          animate: true,
        });
      });

      activeLocationLabels.push(marker);
    });
  }

  function supportsClustering() {
    return typeof L.markerClusterGroup === 'function';
  }

  function createClusterLayer(categoryKey) {
    if (!supportsClustering()) return null;

    const category = categoryKey === '__all__' ? null : getCategoryMeta(categoryKey);

    return L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      zoomToBoundsOnClick: true,
      maxClusterRadius: zoom => {
        if (zoom <= -2) return 140;
        if (zoom <= -1) return 100;
        return 72;
      },
      iconCreateFunction(cluster) {
        return L.divIcon({
          className: 'poi-cluster-icon',
          html: `<div class="poi-cluster-badge" style="--cluster-color: ${category?.color ?? '#d7ad31'}">${cluster.getChildCount()}</div>`,
          iconSize: [40, 40],
        });
      },
    });
  }

  function getClusterLayer(categoryKey) {
    if (!clusterLayers.has(categoryKey)) {
      const layer = createClusterLayer(categoryKey);
      if (layer) {
        clusterLayers.set(categoryKey, layer);
        map.addLayer(layer);
      }
    }

    return clusterLayers.get(categoryKey) ?? null;
  }

  function clearMarkers() {
    activeMarkers.forEach(({ marker }) => marker.remove());
    clearLocationLabels();
    clusterLayers.forEach(layer => {
      map.removeLayer(layer);
      layer.clearLayers();
    });
    clusterLayers = new Map();
    activeMarkers = [];
    activeMarkerEl = null;
  }

  function buildMarkers(regionKey = getCurrentRegion()) {
    clearMarkers();
    const pois = getRegions()[regionKey].pois;
    const shouldCluster = supportsClustering() && shouldClusterMarkers() && !isDeveloperModeEnabled();
    const clusterByCategory = shouldClusterByCategory();

    pois.forEach(poi => {
      const category = getCategoryMeta(poi.category);
      if (!category) return;

      const el = createMarkerElement(poi);
      const marker = L.marker(poi.coords, {
        icon: L.divIcon({
          className: 'poi-div-icon',
          html: el,
          iconSize: [28, 34],
          iconAnchor: [14, 34],
          popupAnchor: [0, -34],
        }),
        keyboard: false,
        draggable: isDeveloperModeEnabled(),
      });

      if (shouldCluster) {
        // Category-aware clustering is optional and driven by user settings.
        const clusterKey = clusterByCategory ? poi.category : '__all__';
        getClusterLayer(clusterKey)?.addLayer(marker);
      } else {
        marker.addTo(map);
      }

      setMarkerDragState(marker, isDeveloperModeEnabled());

      marker.on('click', event => {
        if (event.originalEvent) L.DomEvent.stop(event.originalEvent);

        const cat = getCategoryMeta(poi.category);
        const subcat = getTypeMeta(poi.category, poi.type);
        console.debug('POI clicked', {
          point: serializePointForJson(poi),
          developerModeEnabled: isDeveloperModeEnabled(),
          categoryLabel: cat?.label ?? null,
          typeLabel: subcat?.label ?? null,
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

      activeMarkers.push({
        marker,
        el,
        poi,
        categoryKey: poi.category,
        clusterKey: clusterByCategory ? poi.category : '__all__',
      });
    });

    buildLocationLabels(regionKey, pois);
    refreshMarkerVisibility();
  }

  function refreshMarkerVisibility() {
    const activeFilters = getActiveFilters();
    activeMarkers.forEach(({ marker, poi, clusterKey }) => {
      const isVisible = activeFilters.has(getFilterKey(poi.category, poi.type));
      const clusterLayer = clusterLayers.get(clusterKey) ?? null;
      const isOnMap = clusterLayer ? clusterLayer.hasLayer(marker) : map.hasLayer(marker);

      if (isVisible && !isOnMap) {
        if (clusterLayer) clusterLayer.addLayer(marker);
        else marker.addTo(map);
      }

      if (!isVisible && isOnMap) {
        if (clusterLayer) clusterLayer.removeLayer(marker);
        else marker.remove();
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
    const point = entry.point ?? entry.poi;
    if (!point) return;
    currentPopup = openPopupForPoint(point, entry.marker.getLatLng(), activeEl);
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
