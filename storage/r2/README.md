# Local R2 storage mirror

Selected ingredient/dish/add-on images and uploaded bill files are saved here.

## Layout

```
storage/r2/
  dishes/{slug}/default.{jpg|png|webp}
  dishes/{slug}/secondary.{jpg|png|webp}
  ingredients/{slug}/default.{jpg|png|webp}
  ingredients/{slug}/secondary.{jpg|png|webp}
  addons/{slug}/default.{jpg|png|webp}
  addons/{slug}/secondary.{jpg|png|webp}
  {userId}/supplier_bill/{billId}-{filename}.{pdf|png|jpg}
  {userId}/customer_bill/{billId}-{filename}.{pdf|png|jpg}
```

Catalog slugs come from `test/inventory/*.json` (e.g. `dish-sunrise-stack`, `ing-croissant`, `addon-bacon`) and are stable across **Load test data** runs. MongoDB `_id` values change each re-seed; image paths use **slug**, not `_id`.

Example:

```
storage/r2/dishes/dish-sunrise-stack/default.jpg
storage/r2/dishes/dish-sunrise-stack/secondary.jpg
storage/r2/ingredients/ing-black-tea/default.jpg
storage/r2/addons/addon-bacon/default.jpg
storage/r2/507f1f77bcf86cd799439011/supplier_bill/664a...-costco-beverages.pdf
```

After the first image generation (or if you commit images under these paths), re-loading test data re-attaches them without calling the agent again.

## Retention

- **Bills:** last **5 uploads per type** per user (supplier + customer). Older files and DB records are pruned on each new upload.
- **Chat:** last **5 conversations** per user (Sous Chef dock, `context: head`)

## Serving

The web app exposes files at `/api/r2/{relative-key}`.

- Catalog images: public within the app
- Bill files: require login; path must match your user id

MongoDB stores:
- `BillUpload.fileR2Key`, `fileUrl`, `userId`
- `Conversation.userId` for chat sessions

## Cloudflare R2 (production)

Point `R2_STORAGE_ROOT` at a mounted bucket or replace storage helpers with the S3-compatible R2 SDK using the same key layout.
