# Add-ons

**Add-ons** are POS modifiers — extra bacon, cheese, veggies, whipped cream, espresso shots — sold with a dish. Each has its own class, description, price, and pantry links.

## Kitchen Control (manual add)

Typical fields you enter in **+ Add-on**:

| Field | Example |
|-------|---------|
| Name | `American Cheese` |
| Class | `cheese` (preset **Add-on** or custom: `protein`, `cheese`, `veggie`, `coffee`) |
| Description | `Kraft American cheese single` |
| Sell price | `0.75` |
| Ingredient links | `American Cheese Singles` → 1 each |
| Linked dishes | Optional — also filled when the modifier appears on a sales receipt after a dish line |

Use **Generate Image** → **Save**. Description is preferred over class for image keywords.

## Runtime fields (MongoDB)

| Field | Description |
|-------|-------------|
| `slug` | e.g. `addon-american-cheese` |
| `name` | Modifier name |
| `classification` | Modifier group — `protein`, `cheese`, `veggie`, `coffee`, … |
| `description` | POS / image context |
| `sellPrice` | Modifier price |
| `linkedDishSlugs[]` | Dishes this modifier was ordered with |
| `ingredientLinks[]` | Pantry usage per add-on |
| `recipeStatus` | Same lifecycle as dishes |

## Sample entries (like manual add)

### Protein (sandwich modifier)

```json
{
  "slug": "addon-bacon",
  "name": "Bacon",
  "classification": "protein",
  "description": "Extra Tyson Applewood Bacon on any sandwich",
  "sellPrice": 1.5,
  "posName": "Extra Tyson Applewood Bacon",
  "ingredientSlugs": ["ing-bacon"],
  "linkedDishClassifications": ["sandwich", "byo-sandwich"]
}
```

### Cheese (separate class from generic “add-on”)

```json
{
  "slug": "addon-american-cheese",
  "name": "American Cheese",
  "classification": "cheese",
  "description": "Kraft American cheese single",
  "sellPrice": 0.75,
  "posName": "Kraft American Cheese Slice",
  "ingredientSlugs": ["ing-american"],
  "linkedDishClassifications": ["sandwich", "byo-sandwich"]
}
```

```json
{
  "slug": "addon-cheese",
  "name": "Cheddar",
  "classification": "cheese",
  "description": "Tillamook cheddar slice",
  "sellPrice": 0.75,
  "posName": "Tillamook Cheddar Slice",
  "ingredientSlugs": ["ing-cheddar"],
  "linkedDishClassifications": ["sandwich", "byo-sandwich"]
}
```

### Veggie

```json
{
  "slug": "addon-veggies",
  "name": "Veggie mix",
  "classification": "veggie",
  "description": "Spinach, tomato, and bell pepper",
  "sellPrice": 1.0,
  "posName": "Earthbound Spinach, Roma Tomato, Bell Pepper",
  "ingredientSlugs": ["ing-spinach", "ing-tomato", "ing-bell-pepper"],
  "linkedDishClassifications": ["sandwich", "byo-sandwich"]
}
```

### Coffee bar

```json
{
  "slug": "addon-whipped-cream",
  "name": "Whipped cream",
  "classification": "coffee",
  "description": "Land O Lakes heavy cream whipped topping",
  "sellPrice": 0.75,
  "posName": "Extra Land O Lakes Heavy Cream Whipped Topping",
  "ingredientSlugs": ["ing-heavy-cream"],
  "linkedDishClassifications": ["coffee", "beverage"]
}
```

```json
{
  "slug": "addon-extra-shot",
  "name": "Extra espresso shot",
  "classification": "coffee",
  "description": "Additional Lavazza espresso pull",
  "sellPrice": 1.25,
  "posName": "Extra Lavazza Espresso Shot",
  "ingredientSlugs": ["ing-espresso"],
  "linkedDishClassifications": ["coffee", "beverage"]
}
```

## Classes in test data

| Class | Examples |
|-------|----------|
| protein | Bacon, Sausage, Egg |
| cheese | Cheddar, American Cheese, Swiss |
| veggie | Veggie mix |
| coffee | Whipped cream, Extra espresso shot |

On the **Menu** tab, add-ons group by **their own** `classification`, not the linked dish’s class.

## Test catalog

Full list: [`test/inventory/add-ons.json`](../../test/inventory/add-ons.json).  
`linkedDishClassifications` in JSON maps to `linkedDishSlugs` on seed and when modifiers follow a dish on a POS receipt.

## Flow

1. Sales order line with `menuItemKind: addon` creates or updates an add-on with `classification` and `description`.
2. Recipe Agent links `ingredientLinks` after purchase orders are processed.
3. Activate add-on recipes on the Recipes page together with dishes.
