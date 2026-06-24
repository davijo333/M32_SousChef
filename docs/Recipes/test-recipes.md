# Test recipes (Panera Cafe)

Expected outcome after uploading **all** test bills in `test/bills/customer/` and `test/bills/supplier/` (16 + 18 files). See [`manifest.json`](../../test/bills/manifest.json) for which dishes each bill covers.

## Upload order

1. **Customer** — all `N.c_bill.pdf` / `N.c_bill.png` files
2. **Supplier** — all `Bill-N_*.pdf` / `Bill-N_*.png` files

Process each supplier file so the Recipe Agent runs and ingredient labels refresh. **Purchase before sales** when seeding a fresh kitchen.

Process each supplier file so the Recipe Agent runs and labels refresh.

## Dishes by classification

### Signature Sandwiches (`sandwich`)

| Dish | Key ingredients (from catalog) |
|------|--------------------------------|
| Sunrise Stack | croissant, bacon, egg, cheddar |
| Garden Morning Croissant | croissant, spinach, tomato, avocado |
| Farmer's Double | sourdough, sausage, egg, american |
| Veggie Croissant | croissant, spinach, tomato, bell pepper |
| Sourdough Melt | sourdough, bacon, cheddar |

### BYO Sandwiches (`byo-sandwich`)

| Dish | Key ingredients |
|------|-----------------|
| Build-Your-Own Croissant | croissant, bacon, egg, swiss |
| Build-Your-Own Sourdough | sourdough, sausage, egg |
| Build-Your-Own Bagel | bagel, bacon, spinach, tomato |
| Loaded Bagel | bagel, sausage, egg, american |
| Classic Bagel | bagel, butter |
| Multigrain Bagel | multigrain bagel, butter |

### Coffee (from SO SQ-20260622-COF, SQ-20260623-MIX)

| Dish | Key ingredients |
|------|-----------------|
| Lavazza House Hot Coffee | coffee beans, espresso |
| Hot Coffee | coffee beans, whole milk |
| Oat Vanilla Coffee | coffee beans, oat milk, vanilla syrup |
| Iced Skim Frappe | espresso, skim milk, ice |
| Caramel Almond Frappe | espresso, almond milk, caramel syrup, ice |
| Hazelnut Mocha | espresso, mocha syrup, whole milk, hazelnut syrup |
| Vanilla Cappuccino | espresso, half-and-half, vanilla syrup, frothing milk |
| Oat Milk Mocha | oat milk, mocha syrup, espresso |
| Soy Milk Coffee | coffee beans, soy milk |

### Tea & juice (from SO TST-20260622-BEV)

| Dish | Key ingredients |
|------|-----------------|
| English Breakfast Tea | black tea |
| Green Tea | green tea |
| Orange Juice | orange juice |
| Apple Juice | apple juice |
| Cranberry Juice | cranberry juice |

## Add-ons (from SO SQ-20260622-COF)

| Add-on | Ingredients |
|--------|-------------|
| Whipped cream | heavy cream |

Other add-ons (bacon, sausage, egg, cheese, veggies) appear when POS lines include modifier text; see [`add-ons.json`](../../test/inventory/add-ons.json). Add-ons link to both `sandwich` and `byo-sandwich` classes.

## PO coverage map

Five wholesaler invoices (`SYSCO-4821` … `SYSCO-4823`) map to **18 supplier bill files**. Line-level ingredient coverage is in [`manifest.json`](../../test/bills/manifest.json) under `supplierBills`.

## Recipe status after agent

All linked dishes/add-ons should show **`new`** on the Recipes page. Select all (default) → **Activate selected** → **`active`**.

## Partial upload behavior

| If you only upload… | Expect |
|---------------------|--------|
| SO without PO | Dishes exist; recipes empty; no pantry |
| PO bills 1–2 only | Signature & BYO sandwiches link; coffee/tea/juice lines may be `missing` |
| Full PO set | All catalog slugs in pantry; minimal `missing` |

Reference slugs: [`test/inventory/`](../../test/inventory/).
