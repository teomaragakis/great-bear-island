# Great Bear Island

Interactive map app for exploring *The Long Dark* regions with layered static map imagery, category-based points of interest, searchable filtering, clustering, and built-in tooling for authoring POIs.

⚠️ Right now only Coastal Highway is enabled and most POIs are missing. Consider this an alpha.

View it here: [teomaragakis.github.io/great-bear-island/](https://teomaragakis.github.io/great-bear-island/)

## Overview

This project renders region maps as static image overlays with Leaflet and a JSON-driven data model. As a fan of the game, I initially used https://elektronixx.github.io/TLD-Interactive-Map/ but I was not happy with the fact that POIs on the map were static and the map itself was not very realistic, so I used [The Long Dark Topographic Maps](https://steamcommunity.com/sharedfiles/filedetails/?id=1142193220) made by delta. Delta, if you're reading this you're a god damn legend.

Current functionality includes:

- Region metadata loaded from `data/regions.json`
- Per-region POI data loaded from `data/regions/<region>.json`
- Shared point taxonomy loaded from `data/categories.json`
- Region switching through the top-bar region selector
- Layer switching between aerial contour, aerial, and topographic map views
- Region overview modal with description and stat cards
- Region label overlays loaded from `regions.json`
- Grouped legend built from the category/type taxonomy
- POI filtering at type level, including per-group show/hide and global show/hide
- Searchable POI legend that matches category or type labels
- Sidebar settings for grouping nearby items, grouping by category, hiding missing categories, showing DLC categories, and flattening the grouped legend into a single alphabetical list
- Category-aware clustering in view mode
- Custom POI markers and popups with icon, title, category label, description, developer coordinates, and optional contents lists
- Popup behavior controlled from taxonomy metadata
- Static-image map bounds handling with responsive refit on resize
- Developer mode for creating temporary POIs, editing existing POIs, dragging markers, deleting POIs, previewing the combined JSON snapshot, copying it to the clipboard, and exporting it as a file

## Tech Stack

- HTML
- CSS
- Vanilla JavaScript
- [Leaflet](https://leafletjs.com/) for static image maps

## Project Structure

```text
.
├── data/
│   ├── README.md
│   ├── regions.json
│   ├── categories.json
│   └── regions/
│       ├── README.md
│       ├── coastal-highway.json
│       └── pleasant-valley.json
├── src/
│   ├── config/
│   ├── data/
│   ├── map/
│   ├── state/
│   └── ui/
├── assets/
│   └── maps/
├── index.html
├── style.css
├── README.md
└── dev-server.sh
```

## Running Locally

Serve the project over HTTP so the browser can fetch the JSON data files:

```bash
./dev-server.sh
```

Then open `http://localhost:8000`.

## Data Model

`data/regions.json` contains region-level metadata under the `regions` key:

- display name
- `desc` and `stats`
- layer image paths and image size
- path to the region POI file
- optional `locations` label metadata
- optional `disabled` / `dlc` flags

Per-region files in `data/regions/` are grouped by category and then by type.

Saved region POIs use this shape:

```json
{
  "locations": {
    "building": [
      {
        "id": "quonset-garage",
        "name": "Quonset Garage",
        "pixelCoords": [4393, 2591]
      }
    ]
  }
}
```

Inside each type array, POIs can include:

```json
{
  "id": "poi-0001",
  "name": "Optional Name",
  "desc": "Optional description.",
  "contents": ["bed", "first-aid"],
  "target-region": "pleasant-valley",
  "pixelCoords": [1800, 1200]
}
```

`data/categories.json` defines the master category and type taxonomy, including:

- category labels and colors
- type labels and optional wiki `url`
- optional `popup` behavior flags
- optional type-specific field schemas
- optional `dlc` flags

Icons are resolved from `assets/icons/index.json` plus matching SVG files in `assets/icons/`.

At runtime, each POI is normalized with Leaflet-friendly coordinates derived from `pixelCoords`.

## User Features

- Switch between available map layers for the current region
- Open region information from the header
- Browse POIs through a grouped or flattened sidebar legend
- Search categories and types from the sidebar search input
- Toggle individual POI types, whole legend groups, or all POIs at once
- Hide legend items that do not exist in the current region
- Show or hide DLC-tagged categories
- Group nearby POIs, optionally by category
- View POI popups directly on the map
- View popup contents lists for container-style POIs

## Developer Mode

Developer mode is available from the map controls and is intended for POI authoring.

In developer mode you can:

- Click the map to create temporary POIs
- Edit category, type, name, description, and schema-driven custom fields in the sidebar
- Drag existing region POIs and temporary POIs to update their pixel coordinates
- Inspect live `x` and `y` coordinates in the popup and editor
- Delete POIs
- Open a modal showing the current region's POI snapshot JSON
- Copy the current snapshot JSON to the clipboard
- Export the current snapshot JSON to a file named after the region data file

Temporary POIs are kept in memory and are cleared when switching regions or refreshing the page unless exported.

## Current Scope

The current repository is set up around Coastal Highway, with Pleasant Valley scaffolded and additional regions listed in `data/regions.json` as disabled placeholders until their map assets and POI data are ready.
