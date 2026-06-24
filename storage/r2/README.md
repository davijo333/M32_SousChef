# Local R2 storage mirror

Selected ingredient/dish images and uploaded bill files are saved here.

## Layout

```
storage/r2/
  ingredients/{slug}/image/selected.{jpg|png|webp}
  items/{slug}/image/selected.{jpg|png|webp}
  {userId}/supplier_bill/{billId}-{filename}.{pdf|png|jpg}
  {userId}/customer_bill/{billId}-{filename}.{pdf|png|jpg}
```

Example:

```
storage/r2/ingredients/ing-black-tea/image/selected.jpg
storage/r2/507f1f77bcf86cd799439011/supplier_bill/664a...-costco-beverages.pdf
storage/r2/507f1f77bcf86cd799439011/customer_bill/664b...-square-coffee.pdf
```

## Retention

- **Bills:** last **5 uploads per type** per user (supplier + customer). Older files and DB records are pruned on each new upload.
- **Chat:** last **5 conversations** per user in MongoDB.

## Serving

The web app exposes files at `/api/r2/{relative-key}`.

- Catalog images: public within the app
- Bill files: require login; path must match your user id

MongoDB stores:
- `BillUpload.fileR2Key`, `fileUrl`, `userId`
- `Conversation.userId` for chat sessions

## Cloudflare R2 (production)

Point `R2_STORAGE_ROOT` at a mounted bucket or replace storage helpers with the S3-compatible R2 SDK using the same key layout.
