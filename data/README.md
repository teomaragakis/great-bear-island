# Data Folder

This folder contains the app's editable content.

## Files

- `regions.json`: region-level metadata, map layer paths, stats, labels, and enable/disable flags
- `categories.json`: shared POI taxonomy used by the legend, popups, edit form, and icon lookup
- `regions/`: per-region POI data files

## Structure Example

```text
data/
├── README.md
├── regions.json
├── categories.json
└── regions/
    ├── README.md
    ├── coastal-highway.json
    └── pleasant-valley.json
```

## Conventions

- Region metadata lives in `regions.json`
- Region POIs live in `regions/<region>.json`
- Region POI files are grouped as `category -> type -> [pois]`
- Saved POIs do not repeat `category` or `type` because those are implied by their parent keys
- Named POIs should use slug-like IDs when possible
- Unnamed POIs can use opaque `poi-####` IDs

## Notes

- `pixelCoords` are stored in source JSON and converted to Leaflet coordinates at runtime
- `contents` is an array of type keys from `categories.json`
- `transition` stores a region key from `regions.json`
- categories and types can use `name: false` / `desc: false` to hide those fields in the editor
