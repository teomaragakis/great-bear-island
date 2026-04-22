// Shared in-memory app state plus a few small read helpers used by controllers.
import { DEFAULT_LAYER, DEFAULT_REGION } from '../config/constants.js';

export const state = {
  regions: {},
  regionIndex: {},
  pointCategories: {},
  availableIcons: new Set(),
  currentRegion: DEFAULT_REGION,
  currentLayer: DEFAULT_LAYER,
  activeTypeFilters: new Set(),
};

export function getRegions() {
  return state.regions;
}

export function getRegionIndex() {
  return state.regionIndex;
}

export function getPointCategories() {
  return state.pointCategories;
}

export function getCurrentRegion() {
  return state.currentRegion;
}

export function getActiveFilters() {
  return state.activeTypeFilters;
}

export function getCategoryMeta(categoryKey) {
  return state.pointCategories[categoryKey];
}

export function getTypeMeta(categoryKey, typeKey) {
  return getCategoryMeta(categoryKey)?.types?.[typeKey] ?? null;
}

function getTypeIconPath(categoryKey, typeKey) {
  // Types can either point at a shared explicit asset path or fall back to a same-name icon file.
  const explicitIcon = getTypeMeta(categoryKey, typeKey)?.icon ?? '';
  if (explicitIcon) {
    return explicitIcon;
  }

  return state.availableIcons.has(typeKey)
    ? `assets/icons/${typeKey}.svg`
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

function resolveAssetUrl(path) {
  return new URL(path, document.baseURI).href;
}

export function getPointIcon(categoryKey, typeKey, point = null) {
  const icon = point?.icon ?? getTypeIconPath(categoryKey, typeKey);
  if (!icon) return '';

  if (isSvgIcon(icon)) {
    // SVGs are emitted as masked spans so CSS can recolor them consistently.
    const alt = point?.name ?? getTypeMeta(categoryKey, typeKey)?.label ?? '';
    const resolvedIconUrl = resolveAssetUrl(icon);
    return `<span class="icon-asset icon-asset-mask" role="img" aria-label="${escapeHtmlAttribute(alt)}" style="--icon-url: url('${escapeHtmlAttribute(resolvedIconUrl)}');"></span>`;
  }

  return icon;
}
