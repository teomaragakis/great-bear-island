import { getAreaBounds } from '../data/loadAreas.js';

export function createMapView(initialAreaKey, getAreaByKey) {
  const map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: 1,
    zoomControl: true,
    attributionControl: false,
    maxBoundsViscosity: 1,
  });

  let currentImageOverlay = null;

  function getCurrentAreaBounds() {
    return getAreaBounds(getAreaByKey(initialAreaKey()));
  }

  function updateBounds() {
    map.setMaxBounds(getCurrentAreaBounds());
  }

  function clearMapLayers() {
    if (currentImageOverlay) {
      map.removeLayer(currentImageOverlay);
      currentImageOverlay = null;
    }
  }

  function loadMapLayer(areaKey, layerKey) {
    clearMapLayers();

    const area = getAreaByKey(areaKey);
    const imgPath = area.layers[layerKey];
    if (!imgPath) return;

    currentImageOverlay = L.imageOverlay(imgPath, getAreaBounds(area)).addTo(map);
  }

  function fitArea(areaKey, animate = true) {
    map.fitBounds(getAreaBounds(getAreaByKey(areaKey)), {
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
    fitArea,
    getCurrentAreaBounds,
    setMaxZoom,
  };
}
