# Recipe classifications

Recipes inherit classification from the dish or add-on.

## Dish classifications

| Value | UI label | Examples (test data) |
|-------|----------|----------------------|
| `sandwich` | Signature Sandwich | Sunrise Stack, Farmer's Double, Veggie Croissant |
| `byo-sandwich` | BYO Sandwich | Build-Your-Own Bagel, Classic Bagel, Loaded Bagel |
| `coffee` | Coffee | Hot Coffee, Caramel Almond Frappe |
| `tea` | Tea | English Breakfast Tea |
| `juice` | Juice | Orange Juice, Apple Juice |
| `beverage` | Beverages | Umbrella for coffee/tea/juice on filters |

Add-ons use `addon` internally; they appear under **Add-on recipes** on the Recipes page.

Recipes UI groups dishes by class label (e.g. **Signature Sandwiches**, **BYO Sandwiches**). Active and Inactive tabs support search and class filters.

## DB field

Stored on `Dish.classification` (and `AddOn.classification`). Legacy rows may only have `category`; new uploads should set `classification` from the catalog or parser.

## Test catalog

Full list: [`test/inventory/dishes.json`](../../test/inventory/dishes.json) → `classifications` array.
