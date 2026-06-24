# Test recipes (Sunrise Diner)

Expected outcome after uploading **all** test sales orders then **all** test purchase orders (`Bill-1` … `Bill-10`).

## Upload order

1. Customer: `test/bills/customer/1.c_bill.pdf` through `8.c_bill.png` (four logical receipts).
2. Supplier: `test/bills/supplier/Bill-1_Sysco.pdf` through `Bill-10_Sysco.png`.

Process each supplier file so the Recipe Agent runs and labels refresh.

## Dishes by classification

### Sandwiches (from SO SQ-20260622-AM, SQ-20260623-MIX)

| Dish | Key ingredients (from catalog) |
|------|--------------------------------|
| Sunrise Stack | croissant, bacon, egg, cheddar |
| Garden Morning Croissant | croissant, spinach, tomato, avocado |
| Farmer's Double | sourdough, sausage, egg, american |
| Build-Your-Own Croissant | croissant, bacon, egg, swiss |
| Build-Your-Own Sourdough | sourdough, sausage, egg |
| Build-Your-Own Bagel | bagel, bacon, spinach, tomato |
| Veggie Croissant | croissant, spinach, tomato, bell pepper |
| Sourdough Melt | sourdough, bacon, cheddar |
| Loaded Bagel | bagel, sausage, egg, american |

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

Other add-ons (bacon, sausage, egg, cheese, veggies) appear when POS lines include modifier text; see [`add-ons.json`](../../test/inventory/add-ons.json).

## PO coverage map

| PO | Bills | New pantry SKUs |
|----|-------|-----------------|
| SYSCO-4821 | 1–2 | Bakery, proteins, cheese, produce (14 lines) |
| SYSCO-4822 | 3–4 | Dairy, coffee, syrups, ice (15 lines) |
| COSTCO-90614 | 5–6 | Tea, juices (5 lines) |
| USF-77102 | 7–8 | Proteins, dairy restock (6 lines) |
| SYSCO-4823 | 9–10 | Mixed restock (10 lines) |

## Recipe status after agent

All linked dishes/add-ons should show **`new`** on the Recipes page. Select all (default) → **Activate selected** → **`active`**.

## Partial upload behavior

| If you only upload… | Expect |
|---------------------|--------|
| SO without PO | Dishes exist; recipes empty; no pantry |
| PO bills 1–2 only | Sandwiches link; coffee/tea/juice lines may be `missing` |
| Full PO set | All catalog slugs in pantry; minimal `missing` |

Reference slugs: [`test/inventory/`](../../test/inventory/).
