import { DEFAULT_AREA, DEFAULT_LAYER } from '../config/constants.js';

export const state = {
  areas: {},
  areaIndex: {},
  pointCategories: {},
  availableIcons: new Set(),
  currentArea: DEFAULT_AREA,
  currentLayer: DEFAULT_LAYER,
  activeSubcategoryFilters: new Set(),
};

export function getAreas() {
  return state.areas;
}

export function getAreaIndex() {
  return state.areaIndex;
}

export function getPointCategories() {
  return state.pointCategories;
}

export function getCurrentArea() {
  return state.currentArea;
}

export function getCurrentLayer() {
  return state.currentLayer;
}

export function getActiveFilters() {
  return state.activeSubcategoryFilters;
}

export function getCategoryMeta(categoryKey) {
  return state.pointCategories[categoryKey];
}

export function getSubcategoryMeta(categoryKey, subcategoryKey) {
  return getCategoryMeta(categoryKey)?.subcategories?.[subcategoryKey] ?? null;
}

function getSubcategoryIconPath(subcategoryKey) {
  return state.availableIcons.has(subcategoryKey)
    ? `assets/icons/${subcategoryKey}.svg`
    : '';
}

function isSvgIcon(icon) {
  return typeof icon === 'string' && icon.trim().toLowerCase().endsWith('.svg');
}

function escapeHtmlAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function getPointIcon(categoryKey, subcategoryKey, point = null) {
  const icon = point?.icon ?? getSubcategoryIconPath(subcategoryKey);
  if (!icon) return '';

  if (isSvgIcon(icon)) {
    const alt = point?.name ?? getSubcategoryMeta(categoryKey, subcategoryKey)?.label ?? '';
    return `<span class="icon-asset icon-asset-mask" role="img" aria-label="${escapeHtmlAttribute(alt)}" style="--icon-url: url('${escapeHtmlAttribute(icon)}');"></span>`;
  }

  return icon;
}
