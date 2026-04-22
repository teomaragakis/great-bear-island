// Schema-driven edit form for editing one POI at a time.
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function createEditPoiForm({
  entry,
  getPointCategories,
  getCategoryMeta,
  getRegionIndex,
  syncEntryMarkerVisual,
  rememberPointConfig,
  openEditEditor,
  deleteEditEntry,
  refreshPopup,
}) {
  const { point } = entry;

  function getTypeMeta(categoryKey, typeKey) {
    return getCategoryMeta(categoryKey)?.types?.[typeKey] ?? null;
  }

  function getTypeFields(categoryKey, typeKey) {
    const type = getTypeMeta(categoryKey, typeKey);
    const fields = { ...(type?.fields ?? {}) };

    if (type?.transition === true && !fields.transition) {
      fields.transition = {
        label: 'Region connection',
        type: 'region-key',
      };
    }

    return fields;
  }

  function getTypeSupportsContents(categoryKey, typeKey) {
    return getTypeMeta(categoryKey, typeKey)?.contents === true;
  }

  function shouldHideNameField(categoryKey, typeKey) {
    const categoryName = getCategoryMeta(categoryKey)?.name;
    const typeName = getTypeMeta(categoryKey, typeKey)?.name;
    if (typeName === false) return true;
    if (typeName === true) return false;
    return categoryName === false;
  }

  function shouldHideDescField(categoryKey, typeKey) {
    const categoryDesc = getCategoryMeta(categoryKey)?.desc;
    const typeDesc = getTypeMeta(categoryKey, typeKey)?.desc;
    if (typeDesc === false) return true;
    if (typeDesc === true) return false;
    return categoryDesc === false;
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

  function getPointFieldValue(targetPoint, fieldKey) {
    if (targetPoint[fieldKey] !== undefined) return targetPoint[fieldKey];
    return '';
  }

  function buildFieldInput(fieldKey, fieldMeta, targetPoint) {
    const value = getPointFieldValue(targetPoint, fieldKey);
    const label = fieldMeta.label ?? fieldKey;
    const isChecked = value !== '';

    if (fieldMeta.type === 'region-key') {
      return `
        <div class="form-field edit-field" data-custom-field="${escapeHtml(fieldKey)}">
          <label class="form-toggle settings-toggle edit-inline-toggle">
            <span class="form-label">${escapeHtml(label)}</span>
            <input
              data-role="custom-field-toggle"
              data-field-key="${escapeHtml(fieldKey)}"
              type="checkbox"
              ${isChecked ? 'checked' : ''}
            >
            <span class="settings-switch" aria-hidden="true"></span>
          </label>
          <select
            class="form-control"
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
      <div class="form-field edit-field" data-custom-field="${escapeHtml(fieldKey)}">
        <span class="form-label">${escapeHtml(label)}</span>
        <input
          class="form-control"
          data-role="custom-field"
          data-field-key="${escapeHtml(fieldKey)}"
          type="text"
          value="${escapeHtml(value)}"
        >
      </div>
    `;
  }

  function buildCustomFieldsMarkup(categoryKey, typeKey, targetPoint) {
    return Object.entries(getTypeFields(categoryKey, typeKey))
      .map(([fieldKey, fieldMeta]) => buildFieldInput(fieldKey, fieldMeta, targetPoint))
      .join('');
  }

  function buildContentTypeOptions(selectedType = '') {
    const placeholder = `
      <option value="" ${selectedType === '' ? 'selected' : ''}>Select content</option>
    `;

    // Contents can reference any registered type, so the picker is grouped by category.
    return placeholder + Object.entries(getPointCategories()).map(([, category]) => {
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

  function buildContentsFieldMarkup(categoryKey, typeKey, targetPoint) {
    if (!getTypeSupportsContents(categoryKey, typeKey)) return '';

    const contents = Array.isArray(targetPoint.contents) ? targetPoint.contents : [];
    const hasContents = contents.length > 0;
    const rows = contents.map((contentType, index) => `
      <div class="edit-contents-row" data-content-index="${index}">
        <button
          type="button"
          class="edit-content-drag"
          data-role="content-drag"
          data-content-index="${index}"
          draggable="true"
          aria-label="Reorder content"
          title="Drag to reorder"
        >
          <span aria-hidden="true">⋮⋮</span>
        </button>
        <select class="form-control" data-role="content-type" data-content-index="${index}">
          ${buildContentTypeOptions(contentType)}
        </select>
        <button
          type="button"
          class="edit-content-remove"
          data-role="content-remove"
          data-content-index="${index}"
          aria-label="Remove content"
          title="Remove content"
        >
          <span class="edit-content-remove-icon" aria-hidden="true">⊕</span>
        </button>
      </div>
    `).join('');

    return `
      <div class="form-field edit-field edit-contents-field">
        <label class="form-toggle settings-toggle edit-inline-toggle">
          <span class="form-label">Has contents</span>
          <input
            data-role="contents-toggle"
            type="checkbox"
            ${hasContents ? 'checked' : ''}
          >
          <span class="settings-switch" aria-hidden="true"></span>
        </label>
        <div data-role="contents-panel" ${hasContents ? '' : 'hidden'}>
          <div class="edit-contents-list">${rows}</div>
          <button type="button" class="edit-content-add" data-role="content-add">Add content</button>
        </div>
      </div>
    `;
  }

  function syncPointCustomFields(targetPoint) {
    // Keep only fields allowed by the current type schema plus core system fields.
    const allowedFieldKeys = new Set(Object.keys(getTypeFields(targetPoint.category, targetPoint.type)));
    if (shouldHideNameField(targetPoint.category, targetPoint.type)) {
      delete targetPoint.name;
    }
    if (shouldHideDescField(targetPoint.category, targetPoint.type)) {
      delete targetPoint.desc;
    }

    Object.keys(targetPoint).forEach(key => {
      if (['id', 'category', 'type', 'name', 'desc', 'pixelCoords', 'coords', 'contents'].includes(key)) return;
      if (!allowedFieldKeys.has(key)) {
        delete targetPoint[key];
      }
    });
  }

  function attachFieldListeners(container) {
    // All form controls write directly into the live POI object, then refresh popup/editor UI as needed.
    container.querySelectorAll('[data-role="custom-field-toggle"]').forEach(input => {
      const fieldKey = input.dataset.fieldKey;
      const fieldInput = container.querySelector(`[data-role="custom-field"][data-field-key="${fieldKey}"]`);

      input.addEventListener('change', () => {
        if (input.checked) {
          fieldInput.hidden = false;
          point[fieldKey] = fieldInput.value || '';
        } else {
          fieldInput.hidden = true;
          fieldInput.value = '';
          delete point[fieldKey];
        }
        refreshPopup(entry);
      });
    });

    container.querySelectorAll('[data-role="custom-field"]').forEach(input => {
      const fieldKey = input.dataset.fieldKey;
      input.addEventListener('input', () => {
        if (input.value === '') delete point[fieldKey];
        else point[fieldKey] = input.value;
        refreshPopup(entry);
      });
      input.addEventListener('change', () => {
        if (input.value === '') delete point[fieldKey];
        else point[fieldKey] = input.value;
        refreshPopup(entry);
      });
    });

    const contentsToggle = container.querySelector('[data-role="contents-toggle"]');
    const contentsPanel = container.querySelector('[data-role="contents-panel"]');
    const contentAddButton = container.querySelector('[data-role="content-add"]');
    let draggedContentIndex = null;

    function rerenderContentsEditor(focusSelector = '') {
      // Contents rows are rebuilt wholesale because add/remove changes the row indexes.
      openEditEditor(entry, { focusSelector });
      refreshPopup(entry);
    }

    contentsToggle?.addEventListener('change', () => {
      if (contentsToggle.checked) {
        point.contents = Array.isArray(point.contents) && point.contents.length > 0
          ? point.contents
          : [''];
        contentsPanel.hidden = false;
        rerenderContentsEditor('[data-role="content-type"][data-content-index="0"]');
      } else {
        delete point.contents;
        contentsPanel.hidden = true;
        rerenderContentsEditor();
      }
    });

    contentAddButton?.addEventListener('click', () => {
      const nextContents = Array.isArray(point.contents) ? [...point.contents] : [];
      nextContents.push('');
      point.contents = nextContents;
      rerenderContentsEditor(`[data-role="content-type"][data-content-index="${nextContents.length - 1}"]`);
    });

    container.querySelectorAll('[data-role="content-type"]').forEach(select => {
      select.addEventListener('change', () => {
        const nextContents = Array.isArray(point.contents) ? [...point.contents] : [];
        nextContents[Number(select.dataset.contentIndex)] = select.value;
        point.contents = nextContents.filter(Boolean);
        refreshPopup(entry);
      });
    });

    container.querySelectorAll('[data-role="content-remove"]').forEach(button => {
      button.addEventListener('click', () => {
        const nextContents = (point.contents ?? []).filter((_, index) => index !== Number(button.dataset.contentIndex));
        if (nextContents.length === 0) {
          delete point.contents;
        } else {
          point.contents = nextContents;
        }
        rerenderContentsEditor();
      });
    });

    container.querySelectorAll('[data-role="content-drag"]').forEach(handle => {
      handle.addEventListener('dragstart', event => {
        draggedContentIndex = Number(handle.dataset.contentIndex);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(draggedContentIndex));
        handle.closest('.edit-contents-row')?.classList.add('dragging');
      });

      handle.addEventListener('dragend', () => {
        draggedContentIndex = null;
        container.querySelectorAll('.edit-contents-row').forEach(row => row.classList.remove('dragging', 'drag-over'));
      });
    });

    container.querySelectorAll('.edit-contents-row').forEach(row => {
      row.addEventListener('dragover', event => {
        if (draggedContentIndex === null) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        container.querySelectorAll('.edit-contents-row').forEach(candidate => candidate.classList.remove('drag-over'));
        row.classList.add('drag-over');
      });

      row.addEventListener('dragleave', () => {
        row.classList.remove('drag-over');
      });

      row.addEventListener('drop', event => {
        if (draggedContentIndex === null) return;
        event.preventDefault();
        const targetIndex = Number(row.dataset.contentIndex);
        row.classList.remove('drag-over');
        if (targetIndex === draggedContentIndex) return;

        const nextContents = Array.isArray(point.contents) ? [...point.contents] : [];
        const [movedItem] = nextContents.splice(draggedContentIndex, 1);
        nextContents.splice(targetIndex, 0, movedItem);
        point.contents = nextContents;
        rerenderContentsEditor(`[data-role="content-type"][data-content-index="${targetIndex}"]`);
      });
    });
  }

  function buildEditPoiTypeOptions(selectedCategory, selectedType) {
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

  const pointName = point.name ?? '';
  const pointDesc = point.desc ?? '';
  const hideNameField = shouldHideNameField(point.category, point.type);
  const hideDescField = shouldHideDescField(point.category, point.type);
  const customFieldsMarkup = buildCustomFieldsMarkup(point.category, point.type, point);
  const container = document.createElement('div');
  container.className = 'edit-form';
  container.innerHTML = `
    <div class="form-field edit-field">
      <span class="form-label">POI Type</span>
      <select class="form-control" data-role="poi-type">
        ${buildEditPoiTypeOptions(point.category, point.type)}
      </select>
    </div>
    ${hideNameField ? '' : `
    <div class="form-field edit-field">
      <span class="form-label">Name</span>
      <input class="form-control" data-role="name" type="text" value="${escapeHtml(pointName)}">
    </div>
    `}
    ${buildContentsFieldMarkup(point.category, point.type, point)}
    ${customFieldsMarkup ? `
    <div data-role="custom-fields">
      ${customFieldsMarkup}
    </div>
    ` : ''}
    ${hideDescField ? '' : `
    <div class="form-field edit-field">
      <span class="form-label">Description</span>
      <textarea class="form-control" data-role="desc" rows="3">${pointDesc}</textarea>
    </div>
    `}
    <div class="edit-coords">x: ${point.pixelCoords[0]}, y: ${point.pixelCoords[1]}</div>
    <button type="button" class="edit-delete" aria-label="Delete POI" title="Delete POI">
      <span aria-hidden="true">🗑</span>
      <span>Delete POI</span>
    </button>
  `;

  const poiTypeSelect = container.querySelector('[data-role="poi-type"]');
  const nameInput = container.querySelector('[data-role="name"]');
  const descInput = container.querySelector('[data-role="desc"]');
  const deleteButton = container.querySelector('.edit-delete');

  attachFieldListeners(container);

  function rerenderForm() {
    // Type changes can alter visible fields, so rerender from the schema instead of mutating in place.
    syncPointCustomFields(point);
    syncEntryMarkerVisual(entry);
    openEditEditor(entry);
  }

  poiTypeSelect.addEventListener('change', () => {
    const [nextCategory, nextType] = poiTypeSelect.value.split(':');
    if (!nextCategory || !nextType) return;

    point.category = nextCategory;
    point.type = nextType;
    rememberPointConfig(point);
    rerenderForm();
    refreshPopup(entry);
  });

  nameInput?.addEventListener('input', () => {
    point.name = nameInput.value;
    refreshPopup(entry);
  });

  descInput?.addEventListener('input', () => {
    point.desc = descInput.value;
    refreshPopup(entry);
  });

  deleteButton.addEventListener('click', () => {
    deleteEditEntry(entry);
  });

  return container;
}
