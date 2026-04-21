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
- Unnamed POIs can use opaque `poi-####` IDs

## Optional POI Fields

- `name`
- `desc`
- `contents`
- `target-region`
- `icon`
- `pixelCoords`

## Taxonomy Notes

- `data/categories.json` can mark category or type fields with `name: false` or `desc: false`
- `popup: false` disables view-mode popups by default unless the POI has its own description or contents

## Current Files

- `coastal-highway.json`: active region data
- `pleasant-valley.json`: scaffolded placeholder region
