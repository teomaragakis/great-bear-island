# `src` Overview

This folder contains the app's runtime logic. The code is split by responsibility: configuration, data loading, map behavior, state helpers, and UI controllers.

## Top Level

### [`main.js`](/Users/teomaragakis/Development/great-bear-island/src/main.js)
Application entry point. It loads region data, initializes shared state, creates the map and controllers, wires DOM events, and coordinates region/layer switching.

## Related Style Files

Runtime styling lives outside `src` in the top-level `styles/` folder:

- `styles/base.css`: variables, resets, global typography, and Leaflet base sizing
- `styles/layout.css`: app shell, top bar, sidebar, map region, and structural layout
- `styles/components.css`: markers, legend, settings, popups, edit form, and shared form controls
- `styles/modals.css`: shared modal shell plus JSON and region-info modal variants

## `config/`

### [`config/constants.js`](/Users/teomaragakis/Development/great-bear-island/src/config/constants.js)
Shared constants for default region/layer selection and edit/view zoom limits.

## `data/`

### [`data/loadRegions.js`](/Users/teomaragakis/Development/great-bear-island/src/data/loadRegions.js)
Loads `regions.json`, category metadata, and icon manifests. It also normalizes region POI data into the runtime shape, handles legacy field aliases, and formats POIs back into JSON for export.

## `map/`

### [`map/mapView.js`](/Users/teomaragakis/Development/great-bear-island/src/map/mapView.js)
Thin wrapper around Leaflet map setup. It owns region image overlays, bounds updates, fitting the current region, and max-zoom changes between view and edit modes.

### [`map/markerController.js`](/Users/teomaragakis/Development/great-bear-island/src/map/markerController.js)
Builds and manages POI markers, popups, clustering, drag behavior, and region-location labels. This is the core map interaction layer for POIs.

## `state/`

### [`state/appState.js`](/Users/teomaragakis/Development/great-bear-island/src/state/appState.js)
Central in-memory app state plus small read helpers for regions, categories, filters, and icon resolution.

### [`state/typeIndex.js`](/Users/teomaragakis/Development/great-bear-island/src/state/typeIndex.js)
Shared taxonomy lookup helpers. It resolves type-to-category relationships and category render priority so that multiple controllers use the same rules.

## `ui/`

### [`ui/editModeController.js`](/Users/teomaragakis/Development/great-bear-island/src/ui/editModeController.js)
Controls edit mode. It manages the edit toggle UI, temporary markers, the active edit panel, POI deletion, and JSON copy/export tools.

### [`ui/editPoiForm.js`](/Users/teomaragakis/Development/great-bear-island/src/ui/editPoiForm.js)
Schema-driven form renderer for editing one POI. It builds the type picker, optional custom fields, contents editor, and writes changes directly into the live POI object.

### [`ui/legendController.js`](/Users/teomaragakis/Development/great-bear-island/src/ui/legendController.js)
Builds the sidebar legend and filter UI. It computes counts, applies search/filter rules, supports grouped and flattened views, and keeps marker visibility in sync with legend state.

### [`ui/settingsController.js`](/Users/teomaragakis/Development/great-bear-island/src/ui/settingsController.js)
Manages sidebar settings such as grouping, search, DLC visibility, and missing-item visibility. It also persists those settings to `localStorage`.

## Notes

- `src/.DS_Store` is not part of the application logic.
- Most files export factory functions named `create...` because they build stateful controllers/views rather than exposing singleton objects.
