# Great Bear Island

Interactive map app for exploring *The Long Dark* regions with layered static map imagery, category-based points of interest, searchable filtering, and built-in tooling for authoring POIs.

⚠️ Right now only Coastal Highway is enabled and most POIs are missing. Consider this an alpha.

View it here: [teomaragakis.github.io/great-bear-island/](https://teomaragakis.github.io/great-bear-island/)

## Overview

This project renders region maps as static image overlays with Leaflet and a JSON-driven data model. As a fan of the game, I initially used https://elektronixx.github.io/TLD-Interactive-Map/ but I was not happy with the fact that POIs on the map were static and the map itself was not very realistic, so I used [The Long Dark Topographic Maps](https://steamcommunity.com/sharedfiles/filedetails/?id=1142193220) made by delta. Delta, if you're reading this you're a god damn legend.

Current functionality includes:

- Region metadata loaded from `data/areas.json`
- Per-region POI data loaded from `data/areas/<region>.json`
- Shared point taxonomy loaded from `data/point-categories.json`
- Region switching through the top-bar area selector
- Layer switching between aerial contour, aerial, and topographic map views
- Region overview modal with description and stat cards
- Grouped legend built from the category/subcategory taxonomy
- POI filtering at subcategory level, including per-group show/hide and global show/hide
- Searchable POI legend that matches category or subcategory labels
- Sidebar settings for hiding missing categories, showing DLC categories, and flattening the grouped legend into a single alphabetical list
- Custom POI markers and popups with icon, title, category label, description, and developer coordinates
- Static-image map bounds handling with responsive refit on resize
- Developer mode for creating temporary POIs, editing existing POIs, dragging markers, deleting temporary POIs, previewing the combined JSON snapshot, copying it to the clipboard, and exporting it as a file

## Tech Stack

- HTML
- CSS
- Vanilla JavaScript
- [Leaflet](https://leafletjs.com/) for static image maps

## Project Structure

```text
.
├── data/
│   ├── areas.json
│   ├── point-categories.json
│   └── areas/
│       └── coastal-highway.json
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

`data/areas.json` contains area-level metadata:

- display name
- region overview text and stats
- layer image paths and image size
- path to the region POI file

Per-region files in `data/areas/` currently contain an array of POIs.

Each POI uses this shape:

```json
{
  "id": "optional-id",
  "category": "navigation",
  "subcategory": "landmark",
  "name": "Example Point",
  "desc": "Description text.",
  "pixelCoords": [1800, 1200]
}
```

`data/point-categories.json` defines the master category and subcategory taxonomy, including labels, colors, icons, and optional `dlc` flags.

At runtime, each POI is normalized with Leaflet-friendly coordinates derived from `pixelCoords`.

## User Features

- Switch between available map layers for the current region
- Open region information from the header
- Browse POIs through a grouped or flattened sidebar legend
- Search categories and subcategories from the sidebar search input
- Toggle individual POI subcategories, whole legend groups, or all POIs at once
- Hide legend items that do not exist in the current region
- Show or hide DLC-tagged categories
- View POI popups directly on the map

## Developer Mode

Developer mode is available from the map controls and is intended for POI authoring.

In developer mode you can:

- Click the map to create temporary POIs
- Edit category, subcategory, name, and description in the sidebar
- Drag existing region POIs and temporary POIs to update their pixel coordinates
- Inspect live `x` and `y` coordinates in the popup and editor
- Delete temporary POIs
- Open a modal showing the current region's POI snapshot JSON
- Copy the current snapshot JSON to the clipboard
- Export the current snapshot JSON to a file named after the area data file

Temporary POIs are kept in memory and are cleared when switching regions or refreshing the page unless exported.

## Current Scope

The current repository is set up around Coastal Highway, but the data model supports additional regions through the same `areas.json` + per-region `pois` file structure.
