# Test catalog images

Pre-generated dish, ingredient, and add-on photos for the Panera Cafe demo. Same layout as [`storage/r2`](../../storage/r2/README.md):

```
test/storage/r2/
  dishes/{slug}/default.{jpg|png|webp}
  dishes/{slug}/secondary.{jpg|png|webp}
  ingredients/{slug}/...
  addons/{slug}/...
```

## Load test data

`POST /api/seed` (and `?force=1`) copies **test/storage/r2 → storage/r2** before inserting catalog rows, then links images via slug paths. No agent image generation needed on a fresh seed.

## Refresh after regenerating images

After bulk-generating or fixing photos in Kitchen control:

```bash
npm run capture:test-images
git add test/storage/r2
```

This snapshots `storage/r2/{dishes,ingredients,addons}/` into this folder.
