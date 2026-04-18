import { formatPoiJson, serializePointForJson } from '../data/loadAreas.js';

export function createDeveloperModeController({
  map,
  mapView,
  elements,
  getAreas,
  getAreaIndex,
  getCurrentArea,
  getPointCategories,
  getCategoryMeta,
  markerController,
}) {
  let developerModeEnabled = false;
  let temporaryMarkers = [];
  let developerViewButton = null;
  let activeDeveloperEntry = null;

  const {
    developerPoiPanel,
    developerPoiForm,
    jsonModal,
    jsonModalContent,
  } = elements;

  function isDeveloperModeEnabled() {
    return developerModeEnabled;
  }

  function setDeveloperPanelContent(content = null) {
    developerPoiForm.innerHTML = '';
    if (content) {
      developerPoiForm.appendChild(content);
      developerPoiPanel.hidden = false;
      requestAnimationFrame(() => {
        developerPoiPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      return;
    }

    developerPoiPanel.hidden = true;
  }

  function syncDeveloperControls() {
    if (!developerViewButton) return;
    developerViewButton.classList.toggle('visible', developerModeEnabled);
  }

  function hideDeveloperEditor() {
    activeDeveloperEntry = null;
    setDeveloperPanelContent();
  }

  function getCurrentPoisSnapshot() {
    return [
      ...getAreas()[getCurrentArea()].pois.map(serializePointForJson),
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
    const currentArea = getCurrentArea();
    const areaPath = getAreaIndex()[currentArea]?.path ?? `${currentArea}.json`;
    const filename = areaPath.split('/').pop() || `${currentArea}.json`;
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

  function getDefaultSubcategory(categoryKey) {
    const category = getCategoryMeta(categoryKey);
    const [firstSubcategory] = Object.keys(category?.subcategories ?? {});
    return firstSubcategory ?? '';
  }

  function buildDeveloperSubcategoryOptions(categoryKey, selectedSubcategory) {
    const category = getCategoryMeta(categoryKey);
    return Object.entries(category?.subcategories ?? {}).map(([key, subcategory]) => `
      <option value="${key}" ${key === selectedSubcategory ? 'selected' : ''}>${subcategory.label}</option>
    `).join('');
  }

  function buildDeveloperCategoryOptions(selectedCategory) {
    return Object.entries(getPointCategories()).map(([key, category]) => `
      <option value="${key}" ${key === selectedCategory ? 'selected' : ''}>${category.label}</option>
    `).join('');
  }

  function renderDeveloperForm(entry) {
    const { point } = entry;
    const pointName = point.name ?? '';
    const pointDesc = point.desc ?? '';
    const container = document.createElement('div');
    container.className = 'developer-form';
    container.innerHTML = `
      <label class="developer-field">
        <span>Category</span>
        <select data-role="category">
          ${buildDeveloperCategoryOptions(point.category)}
        </select>
      </label>
      <label class="developer-field">
        <span>Subcategory</span>
        <select data-role="subcategory">
          ${buildDeveloperSubcategoryOptions(point.category, point.subcategory)}
        </select>
      </label>
      <label class="developer-field">
        <span>Name</span>
        <input data-role="name" type="text" value="${pointName}">
      </label>
      <label class="developer-field">
        <span>Description</span>
        <textarea data-role="desc" rows="3">${pointDesc}</textarea>
      </label>
      <div class="developer-coords">x: ${point.pixelCoords[0]}, y: ${point.pixelCoords[1]}</div>
      <button type="button" class="developer-delete">Delete POI</button>
    `;

    const categorySelect = container.querySelector('[data-role="category"]');
    const subcategorySelect = container.querySelector('[data-role="subcategory"]');
    const nameInput = container.querySelector('[data-role="name"]');
    const descInput = container.querySelector('[data-role="desc"]');
    const deleteButton = container.querySelector('.developer-delete');

    categorySelect.addEventListener('change', () => {
      point.category = categorySelect.value;
      point.subcategory = getDefaultSubcategory(point.category);
      subcategorySelect.innerHTML = buildDeveloperSubcategoryOptions(point.category, point.subcategory);
      markerController.refreshPopup(entry);
    });

    subcategorySelect.addEventListener('change', () => {
      point.subcategory = subcategorySelect.value;
      markerController.refreshPopup(entry);
    });

    nameInput.addEventListener('input', () => {
      point.name = nameInput.value;
      markerController.refreshPopup(entry);
    });

    descInput.addEventListener('input', () => {
      point.desc = descInput.value;
      markerController.refreshPopup(entry);
    });

    deleteButton.addEventListener('click', () => {
      deleteDeveloperEntry(entry);
    });

    return container;
  }

  function openDeveloperEditor(entry) {
    activeDeveloperEntry = entry;
    setDeveloperPanelContent(renderDeveloperForm(entry));
  }

  function updateDeveloperPointPosition(entry) {
    markerController.refreshPopup(entry);
    if (activeDeveloperEntry === entry) {
      openDeveloperEditor(entry);
    }
  }

  function deleteDeveloperEntry(entry) {
    map.removeLayer(entry.marker);
    temporaryMarkers = temporaryMarkers.filter(candidate => candidate !== entry);

    if (activeDeveloperEntry === entry) {
      activeDeveloperEntry = null;
      setDeveloperPanelContent();
    }

    syncDeveloperControls();
  }

  function clearDeveloperPointers() {
    temporaryMarkers.forEach(({ marker }) => map.removeLayer(marker));
    temporaryMarkers = [];
    activeDeveloperEntry = null;
    setDeveloperPanelContent();
    syncDeveloperControls();
  }

  function onTemporaryMarkerClick(entry) {
    console.debug('Temporary POI clicked', {
      point: serializePointForJson(entry.point),
      developerModeEnabled,
      latlng: entry.marker.getLatLng(),
    });

    markerController.openPopupFromEntry(entry, entry.el);

    if (developerModeEnabled) {
      openDeveloperEditor(entry);
    }
  }

  function createDeveloperToggleControl() {
    return L.Control.extend({
      options: {
        position: 'bottomleft',
      },
      onAdd() {
        const container = L.DomUtil.create('div', 'leaflet-bar developer-controls');
        const toggleButton = L.DomUtil.create('button', 'developer-toggle', container);
        const viewButton = L.DomUtil.create('button', 'developer-view', container);
        toggleButton.type = 'button';
        toggleButton.textContent = '✎';
        toggleButton.setAttribute('aria-pressed', 'false');
        toggleButton.setAttribute('aria-label', 'Toggle edit mode');
        viewButton.type = 'button';
        viewButton.textContent = 'View JSON';
        viewButton.setAttribute('aria-label', 'View current POIs JSON');
        developerViewButton = viewButton;
        syncDeveloperControls();

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.on(toggleButton, 'click', () => {
          developerModeEnabled = !developerModeEnabled;
          toggleButton.classList.toggle('active', developerModeEnabled);
          toggleButton.setAttribute('aria-pressed', String(developerModeEnabled));
          mapView.setMaxZoom(developerModeEnabled ? 2 : 1);
          syncDeveloperControls();
          markerController.closeCurrentPopup();
          markerController.buildMarkers(getCurrentArea());
          markerController.setAllMarkerDragState(developerModeEnabled);
          temporaryMarkers.forEach(({ marker }) => markerController.setMarkerDragState(marker, developerModeEnabled));

          const currentPopup = markerController.getCurrentPopup();
          if (currentPopup) {
            if (activeDeveloperEntry) {
              markerController.openPopupFromEntry(activeDeveloperEntry);
            } else {
              markerController.refreshActivePopupContent();
              if (developerModeEnabled) {
                const activeViewPoi = markerController.getActiveViewPoi();
                const entry = activeViewPoi
                  ? markerController.getMarkerEntryForPoint(activeViewPoi)
                    ?? temporaryMarkers.find(candidate => candidate.point === activeViewPoi)
                  : null;
                if (entry) {
                  openDeveloperEditor({
                    marker: entry.marker,
                    point: entry.poi ?? entry.point,
                    el: entry.el,
                  });
                }
              }
            }
          }

          if (!developerModeEnabled) {
            hideDeveloperEditor();
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
      category: 'navigation',
      subcategory: 'landmark',
      name: '',
      desc: '',
      pixelCoords: [x, y],
    };

    const markerElement = markerController.createMarkerElement(point, 'temporary-marker');
    const developerMarker = L.marker(latlng, {
      icon: L.divIcon({
        className: 'poi-div-icon',
        html: markerElement,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -28],
      }),
      keyboard: false,
      draggable: developerModeEnabled,
    }).addTo(map);

    const entry = { marker: developerMarker, point, el: markerElement };
    developerMarker.on('click', event => {
      if (event.originalEvent) {
        L.DomEvent.stop(event.originalEvent);
      }
      onTemporaryMarkerClick(entry);
    });
    developerMarker.on('dragstart', markerController.closeCurrentPopup);
    developerMarker.on('dragend', () => {
      markerController.applyPixelCoordsToPoint(entry.point, developerMarker.getLatLng());
      updateDeveloperPointPosition(entry);
      markerController.openPopupFromEntry(entry, markerElement);
    });

    temporaryMarkers.push(entry);
    syncDeveloperControls();
    openDeveloperEditor(entry);
    markerController.openPopupFromEntry(entry, entry.el);
  }

  function onExistingPointMoved(entry) {
    updateDeveloperPointPosition(entry);
  }

  function installControl() {
    const Control = createDeveloperToggleControl();
    map.addControl(new Control());
  }

  return {
    installControl,
    isDeveloperModeEnabled,
    openDeveloperEditor,
    onExistingPointMoved,
    addTemporaryMarker,
    openJsonModal,
    closeJsonModal,
    exportCurrentPoisSnapshot,
    copyCurrentPoisSnapshot,
    clearDeveloperPointers,
  };
}
