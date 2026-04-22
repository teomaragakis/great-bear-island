// Developer-only POI editing, JSON export, and temporary marker tooling.
import { EDIT_MODE_MAX_ZOOM, VIEW_MODE_MAX_ZOOM } from '../config/constants.js';
import { formatPoiJson, serializePointForJson } from '../data/loadAreas.js';

export function createDeveloperModeController({
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
}) {
  let developerModeEnabled = false;
  let temporaryMarkers = [];
  let developerViewButton = null;
  let activeDeveloperEntry = null;
  let lastTemporaryPointConfig = {
    category: 'navigation',
    type: 'waterfall',
  };

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
      const firstField = developerPoiForm.querySelector('input:not([hidden]), select:not([hidden]), textarea:not([hidden])');
      firstField?.focus();
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

  function isTemporaryEntry(entry) {
    return temporaryMarkers.includes(entry);
  }

  function syncEntryMarkerVisual(entry) {
    const point = entry.point ?? entry.poi;
    if (!point) return;

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

  function getDefaultType(categoryKey) {
    const category = getCategoryMeta(categoryKey);
    const [firstType] = Object.keys(category?.types ?? {});
    return firstType ?? '';
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function getTypeMeta(categoryKey, typeKey) {
    return getCategoryMeta(categoryKey)?.types?.[typeKey] ?? null;
  }

  function getTypeFields(categoryKey, typeKey) {
    return getTypeMeta(categoryKey, typeKey)?.fields ?? {};
  }

  function getTypeSupportsContents(categoryKey, typeKey) {
    return getTypeMeta(categoryKey, typeKey)?.contents === true;
  }

  function shouldHideNameField(categoryKey, typeKey) {
    return getCategoryMeta(categoryKey)?.name === false || getTypeMeta(categoryKey, typeKey)?.name === false;
  }

  function shouldHideDescField(categoryKey, typeKey) {
    return getCategoryMeta(categoryKey)?.desc === false || getTypeMeta(categoryKey, typeKey)?.desc === false;
  }

  function getSelectableRegionOptions(selectedValue = '') {
    return Object.entries(getRegionIndex())
      .map(([regionKey, regionMeta]) => `
        <option value="${escapeHtml(regionKey)}" ${regionKey === selectedValue ? 'selected' : ''}>
          ${escapeHtml(regionMeta.name)}
        </option>
      `)
      .join('');
  }

  function getPointFieldValue(point, fieldKey) {
    if (point[fieldKey] !== undefined) return point[fieldKey];
    return '';
  }

  function buildFieldInput(fieldKey, fieldMeta, point) {
    // Field rendering is schema-driven from data/categories.json.
    const value = getPointFieldValue(point, fieldKey);
    const label = fieldMeta.label ?? fieldKey;
    const isChecked = value !== '';

    if (fieldMeta.type === 'region-key') {
      if (fieldMeta.required !== true) {
        return `
          <div class="developer-field" data-custom-field="${escapeHtml(fieldKey)}">
            <label class="settings-toggle developer-inline-toggle">
              <span>${escapeHtml(label)}</span>
              <input
                data-role="custom-field-toggle"
                data-field-key="${escapeHtml(fieldKey)}"
                type="checkbox"
                ${isChecked ? 'checked' : ''}
              >
              <span class="settings-switch" aria-hidden="true"></span>
            </label>
            <select
              data-role="custom-field"
              data-field-key="${escapeHtml(fieldKey)}"
              ${isChecked ? '' : 'hidden'}
            >
              <option value="">Select region</option>
              ${getSelectableRegionOptions(value)}
            </select>
          </div>
        `;
      }

      return `
        <div class="developer-field" data-custom-field="${escapeHtml(fieldKey)}">
          <span>${escapeHtml(label)}</span>
          <select data-role="custom-field" data-field-key="${escapeHtml(fieldKey)}">
            <option value="">Select region</option>
            ${getSelectableRegionOptions(value)}
          </select>
        </div>
      `;
    }

    return `
      <div class="developer-field" data-custom-field="${escapeHtml(fieldKey)}">
        <span>${escapeHtml(label)}</span>
        <input
          data-role="custom-field"
          data-field-key="${escapeHtml(fieldKey)}"
          type="text"
          value="${escapeHtml(value)}"
        >
      </div>
    `;
  }

  function buildCustomFieldsMarkup(categoryKey, typeKey, point) {
    return Object.entries(getTypeFields(categoryKey, typeKey))
      .map(([fieldKey, fieldMeta]) => buildFieldInput(fieldKey, fieldMeta, point))
      .join('');
  }

  function buildContentTypeOptions(selectedType = '') {
    return Object.entries(getPointCategories()).map(([, category]) => {
      const options = Object.entries(category?.types ?? {})
        .map(([typeKey, type]) => `
          <option value="${escapeHtml(typeKey)}" ${typeKey === selectedType ? 'selected' : ''}>
            ${escapeHtml(type.label)}
          </option>
        `)
        .join('');

      if (!options) return '';

      return `
        <optgroup label="${escapeHtml(category.label)}">
          ${options}
        </optgroup>
      `;
    }).join('');
  }

  function buildContentsFieldMarkup(categoryKey, typeKey, point) {
    if (!getTypeSupportsContents(categoryKey, typeKey)) {
      return '';
    }

    const contents = Array.isArray(point.contents) ? point.contents : [];
    const hasContents = contents.length > 0;
    const rows = contents.map((contentType, index) => `
      <div class="developer-contents-row" data-content-index="${index}">
        <select data-role="content-type" data-content-index="${index}">
          ${buildContentTypeOptions(contentType)}
        </select>
        <button type="button" class="developer-content-remove" data-role="content-remove" data-content-index="${index}">Remove</button>
      </div>
    `).join('');

    return `
      <div class="developer-field developer-contents-field">
        <label class="settings-toggle developer-inline-toggle">
          <span>Contents</span>
          <input
            data-role="contents-toggle"
            type="checkbox"
            ${hasContents ? 'checked' : ''}
          >
          <span class="settings-switch" aria-hidden="true"></span>
        </label>
        <div data-role="contents-panel" ${hasContents ? '' : 'hidden'}>
          <div class="developer-contents-list">${rows}</div>
          <button type="button" class="developer-content-add" data-role="content-add">Add content</button>
        </div>
      </div>
    `;
  }

  function syncPointCustomFields(point) {
    // Keep POIs aligned with the currently selected type schema.
    const allowedFieldKeys = new Set(Object.keys(getTypeFields(point.category, point.type)));
    if (shouldHideNameField(point.category, point.type)) {
      delete point.name;
    }
    if (shouldHideDescField(point.category, point.type)) {
      delete point.desc;
    }

    Object.keys(point).forEach(key => {
      if (['id', 'category', 'type', 'name', 'desc', 'pixelCoords', 'coords', 'contents'].includes(key)) return;
      if (!allowedFieldKeys.has(key)) {
        delete point[key];
      }
    });
  }

  function attachCustomFieldListeners(container, entry) {
    container.querySelectorAll('[data-role="custom-field-toggle"]').forEach(input => {
      const fieldKey = input.dataset.fieldKey;
      const fieldInput = container.querySelector(`[data-role="custom-field"][data-field-key="${fieldKey}"]`);

      input.addEventListener('change', () => {
        if (input.checked) {
          fieldInput.hidden = false;
          entry.point[fieldKey] = fieldInput.value || '';
        } else {
          fieldInput.hidden = true;
          fieldInput.value = '';
          delete entry.point[fieldKey];
        }
        markerController.refreshPopup(entry);
      });
    });

    container.querySelectorAll('[data-role="custom-field"]').forEach(input => {
      const fieldKey = input.dataset.fieldKey;
      input.addEventListener('input', () => {
        if (input.value === '') delete entry.point[fieldKey];
        else entry.point[fieldKey] = input.value;
        markerController.refreshPopup(entry);
      });
      input.addEventListener('change', () => {
        if (input.value === '') delete entry.point[fieldKey];
        else entry.point[fieldKey] = input.value;
        markerController.refreshPopup(entry);
      });
    });

    const contentsToggle = container.querySelector('[data-role="contents-toggle"]');
    const contentsPanel = container.querySelector('[data-role="contents-panel"]');
    const contentsList = container.querySelector('.developer-contents-list');
    const contentAddButton = container.querySelector('[data-role="content-add"]');

    function rerenderContentsEditor() {
      openDeveloperEditor(entry);
      markerController.refreshPopup(entry);
    }

    contentsToggle?.addEventListener('change', () => {
      if (contentsToggle.checked) {
        entry.point.contents = Array.isArray(entry.point.contents) && entry.point.contents.length > 0
          ? entry.point.contents
          : ['bed'];
        contentsPanel.hidden = false;
      } else {
        delete entry.point.contents;
        contentsPanel.hidden = true;
      }
      rerenderContentsEditor();
    });

    contentAddButton?.addEventListener('click', () => {
      const nextContents = Array.isArray(entry.point.contents) ? [...entry.point.contents] : [];
      nextContents.push('bed');
      entry.point.contents = nextContents;
      rerenderContentsEditor();
    });

    container.querySelectorAll('[data-role="content-type"]').forEach(select => {
      select.addEventListener('change', () => {
        const nextContents = Array.isArray(entry.point.contents) ? [...entry.point.contents] : [];
        nextContents[Number(select.dataset.contentIndex)] = select.value;
        entry.point.contents = nextContents.filter(Boolean);
        markerController.refreshPopup(entry);
      });
    });

    container.querySelectorAll('[data-role="content-remove"]').forEach(button => {
      button.addEventListener('click', () => {
        const nextContents = (entry.point.contents ?? []).filter((_, index) => index !== Number(button.dataset.contentIndex));
        if (nextContents.length === 0) {
          delete entry.point.contents;
        } else {
          entry.point.contents = nextContents;
        }
        rerenderContentsEditor();
      });
    });
  }

  function buildDeveloperPoiTypeOptions(selectedCategory, selectedType) {
    return Object.entries(getPointCategories()).map(([categoryKey, category]) => {
      const options = Object.entries(category?.types ?? {})
        .map(([typeKey, type]) => `
          <option
            value="${escapeHtml(`${categoryKey}:${typeKey}`)}"
            ${categoryKey === selectedCategory && typeKey === selectedType ? 'selected' : ''}
          >
            ${escapeHtml(type.label)}
          </option>
        `)
        .join('');

      if (!options) return '';

      return `
        <optgroup label="${escapeHtml(category.label)}">
          ${options}
        </optgroup>
      `;
    }).join('');
  }

  function renderDeveloperForm(entry) {
    const { point } = entry;
    const pointName = point.name ?? '';
    const pointDesc = point.desc ?? '';
    const hideNameField = shouldHideNameField(point.category, point.type);
    const hideDescField = shouldHideDescField(point.category, point.type);
    const container = document.createElement('div');
    container.className = 'developer-form';
    container.innerHTML = `
      <div class="developer-field">
        <span>POI Type</span>
        <select data-role="poi-type">
          ${buildDeveloperPoiTypeOptions(point.category, point.type)}
        </select>
      </div>
      ${hideNameField ? '' : `
      <div class="developer-field">
        <span>Name</span>
        <input data-role="name" type="text" value="${escapeHtml(pointName)}">
      </div>
      `}
      ${buildContentsFieldMarkup(point.category, point.type, point)}
      <div data-role="custom-fields">
        ${buildCustomFieldsMarkup(point.category, point.type, point)}
      </div>
      ${hideDescField ? '' : `
      <div class="developer-field">
        <span>Description</span>
        <textarea data-role="desc" rows="3">${pointDesc}</textarea>
      </div>
      `}
      <div class="developer-coords">x: ${point.pixelCoords[0]}, y: ${point.pixelCoords[1]}</div>
      <button type="button" class="developer-delete">Delete POI</button>
    `;

    const poiTypeSelect = container.querySelector('[data-role="poi-type"]');
    const nameInput = container.querySelector('[data-role="name"]');
    const descInput = container.querySelector('[data-role="desc"]');
    const deleteButton = container.querySelector('.developer-delete');

    attachCustomFieldListeners(container, entry);

    function rerenderForm() {
      syncPointCustomFields(point);
      syncEntryMarkerVisual(entry);
      openDeveloperEditor(entry);
    }

    poiTypeSelect.addEventListener('change', () => {
      const [nextCategory, nextType] = poiTypeSelect.value.split(':');
      if (!nextCategory || !nextType) return;

      point.category = nextCategory;
      point.type = nextType;
      rememberPointConfig(point);
      rerenderForm();
      markerController.refreshPopup(entry);
    });

    nameInput?.addEventListener('input', () => {
      point.name = nameInput.value;
      markerController.refreshPopup(entry);
    });

    descInput?.addEventListener('input', () => {
      point.desc = descInput.value;
      markerController.refreshPopup(entry);
    });

    deleteButton.addEventListener('click', () => {
      deleteDeveloperEntry(entry);
    });

    return container;
  }

  function openDeveloperEditor(entry) {
    // Existing markers use `poi`; temporary markers use `point`.
    const normalizedEntry = {
      ...entry,
      point: entry.point ?? entry.poi,
    };
    activeDeveloperEntry = normalizedEntry;
    setDeveloperPanelContent(renderDeveloperForm(normalizedEntry));
  }

  function updateDeveloperPointPosition(entry) {
    markerController.refreshPopup(entry);
    if (activeDeveloperEntry === entry) {
      openDeveloperEditor(entry);
    }
  }

  function deleteDeveloperEntry(entry) {
    markerController.closeCurrentPopup();
    if (isTemporaryEntry(entry)) {
      map.removeLayer(entry.marker);
      temporaryMarkers = temporaryMarkers.filter(candidate => candidate !== entry);
    } else {
      const currentRegion = getCurrentRegion();
      const currentPois = getRegions()[currentRegion].pois;
      const point = entry.point ?? entry.poi;
      getRegions()[currentRegion].pois = currentPois.filter(candidate => candidate !== point);
      markerController.buildMarkers(currentRegion);
      onChange();
    }

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

  function setTemporaryMarkersVisible(visible) {
    temporaryMarkers.forEach(({ marker }) => {
      const isOnMap = map.hasLayer(marker);
      if (visible && !isOnMap) {
        marker.addTo(map);
        markerController.setMarkerDragState(marker, developerModeEnabled);
      }

      if (!visible && isOnMap) {
        map.removeLayer(marker);
      }
    });
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
          // Preserve the currently selected POI across the marker rebuild done for edit mode.
          const selectedPoi = markerController.getActiveViewPoi();
          developerModeEnabled = !developerModeEnabled;
          toggleButton.classList.toggle('active', developerModeEnabled);
          toggleButton.setAttribute('aria-pressed', String(developerModeEnabled));
          mapView.setMaxZoom(developerModeEnabled ? EDIT_MODE_MAX_ZOOM : VIEW_MODE_MAX_ZOOM);
          syncDeveloperControls();
          markerController.closeCurrentPopup();
          markerController.buildMarkers(getCurrentRegion());
          markerController.setAllMarkerDragState(developerModeEnabled);
          temporaryMarkers.forEach(({ marker }) => markerController.setMarkerDragState(marker, developerModeEnabled));

          if (developerModeEnabled && selectedPoi) {
            const entry = markerController.getMarkerEntryForPoint(selectedPoi)
              ?? temporaryMarkers.find(candidate => candidate.point === selectedPoi);

            if (entry) {
              markerController.openPopupFromEntry(entry);
              openDeveloperEditor(entry);
            }
          } else if (developerModeEnabled) {
            markerController.refreshActivePopupContent();
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
      category: lastTemporaryPointConfig.category,
      type: lastTemporaryPointConfig.type,
      name: '',
      desc: '',
      pixelCoords: [x, y],
    };
    syncPointCustomFields(point);
    rememberPointConfig(point);

    const markerElement = markerController.createMarkerElement(point, 'temporary-marker');
    const developerMarker = L.marker(latlng, {
      icon: L.divIcon({
        className: 'poi-div-icon',
        html: markerElement,
        iconSize: [32, 38],
        iconAnchor: [16, 38],
        popupAnchor: [0, -38],
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
    setTemporaryMarkersVisible,
    openJsonModal,
    closeJsonModal,
    exportCurrentPoisSnapshot,
    copyCurrentPoisSnapshot,
    clearDeveloperPointers,
  };
}
