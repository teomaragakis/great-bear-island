// Leaflet map wrapper responsible for region image layers and bounds management.
import { VIEW_MODE_MAX_ZOOM, DEFAULT_MAP_BGCOLOR } from '../config/constants.js';
import { getRegionBounds } from '../data/loadRegions.js';

export function createMapView(getCurrentRegionKey, getRegionByKey) {
  // The map itself is just a simple-image viewport; region switching swaps the image overlay.
  const map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: VIEW_MODE_MAX_ZOOM,
    zoomControl: false,
    attributionControl: false,
    maxBoundsViscosity: 1,
  });

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  let currentImageOverlay = null;

  function getCurrentRegionBounds() {
    return getRegionBounds(getRegionByKey(getCurrentRegionKey()));
  }

  function updateBounds() {
    const regionBounds = getCurrentRegionBounds();
    if (!regionBounds) return;
    map.setMaxBounds(regionBounds);
  }

  function clearMapLayers() {
    if (currentImageOverlay) {
      map.removeLayer(currentImageOverlay);
      currentImageOverlay = null;
    }
  }

  function loadMapLayer(regionKey, layerKey) {
    clearMapLayers();

    const region = getRegionByKey(regionKey);
    const imgPath = region?.layers?.[layerKey];
    if (!imgPath) return;

    const bgcolor = region?.layers?.bgcolor ?? DEFAULT_MAP_BGCOLOR;
    map.getContainer().style.backgroundColor = bgcolor;

    currentImageOverlay = L.imageOverlay(imgPath, getRegionBounds(region)).addTo(map);
  }

  function fitRegion(regionKey, animate = true) {
    const region = getRegionByKey(regionKey);
    if (!region) return;

    map.fitBounds(getRegionBounds(region), {
      padding: [0, 0],
      animate,
    });
  }

  function setMaxZoom(maxZoom) {
    map.setMaxZoom(maxZoom);
  }

  return {
    map,
    updateBounds,
    loadMapLayer,
    fitRegion,
    getCurrentRegionBounds,
    setMaxZoom,
  };
}
