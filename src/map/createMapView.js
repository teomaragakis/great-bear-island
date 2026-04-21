// Leaflet map wrapper responsible for region image layers and bounds management.
import { VIEW_MODE_MAX_ZOOM } from '../config/constants.js';
import { getRegionBounds } from '../data/loadAreas.js';

export function createMapView(getCurrentRegionKey, getRegionByKey) {
  const map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: VIEW_MODE_MAX_ZOOM,
    zoomControl: true,
    attributionControl: false,
    maxBoundsViscosity: 1,
  });

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
