// Marker lifecycle for POIs, popups, clustering, and region label overlays.
import { px, serializePointForJson } from '../data/loadRegions.js';
import { getContentTypeMeta, getCategoryRenderPriority } from '../state/typeIndex.js';
import { getFilterKey } from '../ui/legendController.js';

export function createMarkerController({
  map,
  getRegions,
  getRegionIndex,
  getCurrentRegion,
  getPointCategories,
  getActiveFilters,
  getCategoryMeta,
  getTypeMeta,
  getPointIcon,
  shouldClusterMarkers,
  shouldClusterByCategory,
  isEditModeEnabled,
  onOpenEditEditor,
  onEditPointMoved,
  onPoiOpen = () => {},
  onPoiClose = () => {},
  onLocationOpen = () => {},
}) {
  const POPUP_EDGE_PADDING = 20;
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
    const type = getTypeMeta(point.category, point.type);
    const el = document.createElement('div');
    el.className = `custom-marker${extraClassName ? ` ${extraClassName}` : ''}`;
    el.style.setProperty('--category-color', type?.color ?? category.color);
    el.innerHTML = `<div class="marker-icon">${getPointIcon(point.category, point.type, point)}</div>`;
    if (point.id) el.dataset.poiId = point.id;
    return el;
  }

  function hasExplicitDescription(point) {
    return typeof point.desc === 'string' && point.desc.trim().length > 0;
  }

  function hasContents(point) {
    return Array.isArray(point.contents) && point.contents.length > 0;
  }

  function getPopupSetting(point) {
    const category = getCategoryMeta(point.category);
    const type = getTypeMeta(point.category, point.type);

    if (typeof type?.popup === 'boolean') {
      return type.popup;
    }

    if (typeof category?.popup === 'boolean') {
      return category.popup;
    }

    return true;
  }

  function shouldOpenPopupOnClick(point) {
    // Even POIs without explicit text can still open popups if the schema says they should.
    return hasExplicitDescription(point) || hasContents(point) || getPopupSetting(point);
  }

  function getRelatedFilterKeys(point) {
    const filterKeys = new Set([getFilterKey(point.category, point.type)]);

    (point.contents ?? []).forEach(typeKey => {
      const contentMeta = getContentTypeMeta(getPointCategories(), typeKey);
      if (!contentMeta) return;
      filterKeys.add(getFilterKey(contentMeta.categoryKey, contentMeta.typeKey));
    });

    return [...filterKeys];
  }

  function getContentsHtml(point) {
    if (!hasContents(point)) return '';

    const itemsHtml = point.contents.map(typeKey => {
      const contentMeta = getContentTypeMeta(getPointCategories(), typeKey);
      const icon = contentMeta ? getPointIcon(contentMeta.categoryKey, contentMeta.typeKey) : '';
      const label = contentMeta?.type?.label ?? typeKey;

      return `
        <li class="popup-contents-item" title="${label}" aria-label="${label}">
          <span class="popup-contents-icon">${icon}</span>
        </li>
      `;
    }).join('');

    return `
      <div class="info-item popup-contents">
        <div class="popup-label">Contents</div>
        <ul class="info-item-value popup-contents-list">${itemsHtml}</ul>
      </div>
    `;
  }

  function getTransitionHtml(point) {
    if (!point.transition) {
      return '';
    }

    const targetRegionName = getRegionIndex()[point.transition]?.name ?? point.transition;

    return `
      <div class="info-item popup-transition">
        <div class="popup-label">Region Connection</div>
        <div class="info-item-value popup-transition-value">${targetRegionName}</div>
      </div>
    `;
  }

  function getPopupContent(point) {
    // Popups fall back from POI-specific fields to the shared type metadata.
    const category = getCategoryMeta(point.category);
    const type = getTypeMeta(point.category, point.type);
    const pointIcon = getPointIcon(point.category, point.type, point);
    const baseName = point.name || type?.label || category.label;
    const popupTitle = point.number != null ? `${baseName} #${point.number}` : baseName;
    const poiDesc = typeof point.desc === 'string' ? point.desc : '';
    const contentsHtml = getContentsHtml(point);
    const transitionHtml = getTransitionHtml(point);
    const titleHtml = `
      <div class="popup-title-row">
        <span class="popup-title-icon">${pointIcon}</span>
        <div class="popup-title">${popupTitle}</div>
      </div>
    `;
    const idHtml = isEditModeEnabled() && point.id
      ? `
        <div class="popup-meta-row">
          <span class="popup-label">ID</span>
          <span class="popup-mono-value">${point.id}</span>
        </div>
      `
      : '';
    const coordsHtml = isEditModeEnabled()
      ? `
        <div class="popup-coordinates">
          <span class="popup-label">Coordinates</span>
          <span class="popup-mono-value">x: ${point.pixelCoords[0]}, y: ${point.pixelCoords[1]}</span>
        </div>
      `
      : '';

    return `
      <div class="popup-cat" style="color:${type?.color ?? category.color}">${category.label}</div>
      ${titleHtml}
      ${poiDesc ? `<div class="popup-desc">${poiDesc}</div>` : ''}
      ${transitionHtml}
      ${contentsHtml}
      ${idHtml}
      ${coordsHtml}
    `;
  }

  function getPoiInfoContent(point) {
    const type = getTypeMeta(point.category, point.type);
    const poiDesc = typeof point.desc === 'string' ? point.desc : '';
    const typeInfo = typeof type?.info === 'string' ? type.info : '';
    return {
      contents: [getContentsHtml(point), getTransitionHtml(point)].join('').trim(),
      info: [
        poiDesc ? `<div class="info-item"><div class="popup-label">Notes</div><div class="info-item-value">${poiDesc}</div></div>` : '',
        typeInfo ? `<div class="info-item"><div class="popup-label">Info</div><div class="info-item-value">${typeInfo}</div></div>` : '',
      ].join('').trim(),
    };
  }

  function ensurePopupFits(popup, attempt = 0) {
    // Leaflet autopan sometimes needs one follow-up pass after content/layout settles.
    window.setTimeout(() => {
      const popupEl = popup.getElement();
      if (!popupEl || currentPopup !== popup) return;

      const mapRect = map.getContainer().getBoundingClientRect();
      const popupRect = popupEl.getBoundingClientRect();

      let deltaX = 0;
      let deltaY = 0;

      if (popupRect.left < mapRect.left + POPUP_EDGE_PADDING) {
        deltaX = popupRect.left - (mapRect.left + POPUP_EDGE_PADDING);
      } else if (popupRect.right > mapRect.right - POPUP_EDGE_PADDING) {
        deltaX = popupRect.right - (mapRect.right - POPUP_EDGE_PADDING);
      }

      if (popupRect.top < mapRect.top + POPUP_EDGE_PADDING) {
        deltaY = popupRect.top - (mapRect.top + POPUP_EDGE_PADDING);
      } else if (popupRect.bottom > mapRect.bottom - POPUP_EDGE_PADDING) {
        deltaY = popupRect.bottom - (mapRect.bottom - POPUP_EDGE_PADDING);
      }

      if (deltaX !== 0 || deltaY !== 0) {
        map.panBy([deltaX, deltaY], { animate: true });
        if (attempt < 1) {
          map.once('moveend', () => {
            if (currentPopup !== popup) return;
            popup.update();
            ensurePopupFits(popup, attempt + 1);
          });
        }
      }
    }, 20);
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
      autoPan: true,
      keepInView: false,
      autoPanPaddingTopLeft: [POPUP_EDGE_PADDING, POPUP_EDGE_PADDING],
      autoPanPaddingBottomRight: [POPUP_EDGE_PADDING, POPUP_EDGE_PADDING],
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
      if (activeViewPoi === point) {
        activeViewPoi = null;
        if (!isEditModeEnabled()) onPoiClose();
      }
    });

    currentPopup.openOn(map);
    ensurePopupFits(currentPopup);
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
    // Only mutate the currently open popup; background edits should not hijack another POI's popup.
    if (currentPopup && activeViewPoi === point) {
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
        map.setView(latlng, targetZoom, { animate: true });
        onLocationOpen(location);
      });

      activeLocationLabels.push(marker);
    });
  }

  function supportsClustering() {
    return typeof L.markerClusterGroup === 'function';
  }

  function createClusterLayer(clusterKey) {
    if (!supportsClustering()) return null;

    return L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      zoomToBoundsOnClick: true,
      disableClusteringAtZoom: map.getMaxZoom(),
      maxClusterRadius: zoom => {
        if (zoom <= -2) return 140;
        if (zoom <= -1) return 100;
        return 72;
      },
      iconCreateFunction(cluster) {
        // Cluster identity is derived from one child marker so it can reuse the normal icon/color system.
        const firstChildPoint = cluster.getAllChildMarkers()[0]?.__poi ?? null;
        const category = firstChildPoint ? getCategoryMeta(firstChildPoint.category) : null;
        const firstChildType = firstChildPoint ? getTypeMeta(firstChildPoint.category, firstChildPoint.type) : null;
        const clusterIcon = clusterKey !== '__all__' && firstChildPoint
          ? getPointIcon(firstChildPoint.category, firstChildPoint.type, firstChildPoint)
          : '';
        const renderPriority = firstChildPoint ? getCategoryRenderPriority(getPointCategories(), firstChildPoint.category) : 0;

        if (typeof cluster.setZIndexOffset === 'function') {
          cluster.setZIndexOffset(renderPriority);
        }

        return L.divIcon({
          className: 'poi-cluster-icon',
          html: `
            <div class="poi-cluster-badge" style="--cluster-color: ${firstChildType?.color ?? category?.color ?? '#d7ad31'}">
              ${clusterIcon ? `<span class="poi-cluster-badge-icon">${clusterIcon}</span>` : ''}
              <span class="poi-cluster-badge-count">${cluster.getChildCount()}</span>
            </div>
          `,
          iconSize: [44, 44],
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
    const shouldCluster = supportsClustering() && shouldClusterMarkers() && !isEditModeEnabled();
    const clusterByCategory = shouldClusterByCategory();

    // Rebuild markers from current region state so filters, edit mode, and layer toggles stay deterministic.
    pois.forEach(poi => {
      const category = getCategoryMeta(poi.category);
      if (!category) return;

      const el = createMarkerElement(poi);
      const marker = L.marker(poi.coords, {
        icon: L.divIcon({
          className: 'poi-div-icon',
          html: el,
          iconSize: [32, 38],
          iconAnchor: [16, 38],
          popupAnchor: [0, -38],
        }),
        keyboard: false,
        draggable: isEditModeEnabled(),
        zIndexOffset: getCategoryRenderPriority(getPointCategories(), poi.category),
      });
      marker.__poi = poi;

      if (shouldCluster) {
        // Split clustered markers by exact filter key so subtypes do not merge together.
        const clusterKey = clusterByCategory ? getFilterKey(poi.category, poi.type) : '__all__';
        getClusterLayer(clusterKey)?.addLayer(marker);
      } else {
        marker.addTo(map);
      }

      setMarkerDragState(marker, isEditModeEnabled());

      marker.on('click', event => {
        if (event.originalEvent) L.DomEvent.stop(event.originalEvent);

        const cat = getCategoryMeta(poi.category);
        const subcat = getTypeMeta(poi.category, poi.type);
        console.debug('POI clicked', {
          point: serializePointForJson(poi),
          editModeEnabled: isEditModeEnabled(),
          categoryLabel: cat?.label ?? null,
          typeLabel: subcat?.label ?? null,
          latlng: marker.getLatLng(),
        });

        activeViewPoi = poi;
        if (!isEditModeEnabled() && !shouldOpenPopupOnClick(poi)) {
          closeCurrentPopup();
          onPoiOpen(poi);
          return;
        }

        currentPopup = openPopupForPoint(poi, poi.coords, el);

        if (isEditModeEnabled()) {
          onOpenEditEditor({ marker, point: poi, el });
        } else {
          onPoiOpen(poi);
        }
      });

      marker.on('dragstart', closePopupForDrag);
      marker.on('dragend', () => {
        const entry = { marker, point: poi, el };
        applyPixelCoordsToPoint(entry.point, marker.getLatLng());
        onEditPointMoved(entry);
        reopenPopupAfterDrag(entry, el);
      });

      activeMarkers.push({
        marker,
        el,
        poi,
        categoryKey: poi.category,
        clusterKey: clusterByCategory ? getFilterKey(poi.category, poi.type) : '__all__',
      });
    });

    buildLocationLabels(regionKey, pois);
    refreshMarkerVisibility();
  }

  function refreshMarkerVisibility() {
    const activeFilters = getActiveFilters();
    activeMarkers.forEach(({ marker, poi, clusterKey }) => {
      const isVisible = getRelatedFilterKeys(poi).some(filterKey => activeFilters.has(filterKey));
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

    // Hide any open popup whose primary POI type is no longer visible.
    if (activeViewPoi && !activeFilters.has(getFilterKey(activeViewPoi.category, activeViewPoi.type))) {
      closeCurrentPopup();
    }
  }

  function setAllMarkerDragState(enabled) {
    activeMarkers.forEach(({ marker }) => setMarkerDragState(marker, enabled));
  }

  function closeCurrentPopup() {
    if (!currentPopup) return;
    map.closePopup(currentPopup);
    currentPopup = null;
    activeViewPoi = null;
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
    activeViewPoi = point;
    currentPopup = openPopupForPoint(point, entry.marker.getLatLng(), activeEl);
    if (!isEditModeEnabled()) onPoiOpen(point);
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
    getActiveViewPoi,
    getPoiInfoContent,
  };
}
