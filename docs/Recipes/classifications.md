# Recipe classifications

Recipes inherit classification from the dish or add-on.

## Dish classifications

| Value | UI label | Examples (test data) |
|-------|----------|----------------------|
| `sandwich` | Sandwich | Sunrise Stack, Farmer's Double, Loaded Bagel |
| `coffee` | Coffee | Hot Coffee, Caramel Almond Frappe |
| `tea` | Tea | English Breakfast Tea |
| `juice` | Juice | Orange Juice, Apple Juice |
| `beverage` | Beverages | Umbrella for coffee/tea/juice on filters |

Add-ons use `addon` internally; they appear under **Add-on recipes** on the Recipes page.

## DB field

Stored on `Dish.classification` (and `AddOn.classification`). Legacy rows may only have `category`; new uploads should set `classification` from the catalog or parser.

## Test catalog

Full list: [`test/inventory/dishes.json`](../../test/inventory/dishes.json) → `classifications` array.
