# Region POI Files

Each file in this folder stores one region's POIs.

## Structure Example

```text
data/regions/
├── README.md
├── coastal-highway.json
└── pleasant-valley.json
```

## Shape

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

## Rules

- Top-level keys are category keys from `data/categories.json`
- Second-level keys are type keys from the matching category
- Each type contains an array of POIs
- Every saved POI should have an `id`
- Named POIs should prefer slug-like IDs
- Unnamed POIs can use opaque `####` IDs
- Region location labels are not stored here; add those to `data/regions.json` under the region's `locations` array

## Optional POI Fields

- `name`
- `desc`
- `contents`
- `transition`
- `pixelCoords`

## Taxonomy Notes

- `data/categories.json` can mark category or type fields with `name` or `desc`
- Type-level `name` / `desc` values override category-level defaults
- `contents: true` enables the contents editor for that type
- `transition: true` or a `fields.transition` schema enables region-connection editing
- `popup` can be set at category or type level; type-level values override category defaults

## Current Files

- `coastal-highway.json`: active region data
- `pleasant-valley.json`: scaffolded placeholder region
