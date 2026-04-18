import { DEFAULT_AREA, DEFAULT_LAYER } from '../config/constants.js';

export const state = {
  areas: {},
  areaIndex: {},
  pointCategories: {},
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

export function getPointIcon(categoryKey, subcategoryKey) {
  return getSubcategoryMeta(categoryKey, subcategoryKey)?.icon
    ?? getCategoryMeta(categoryKey)?.icon
    ?? '';
}
