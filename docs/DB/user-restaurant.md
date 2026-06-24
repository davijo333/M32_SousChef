# User & Restaurant

**Models:**

- `apps/web/src/models/User.ts`
- `apps/web/src/models/Restaurant.ts`

## User

| Field | Notes |
|-------|-------|
| `email`, `passwordHash` | Credentials auth |
| `restaurantId` | Linked kitchen |

## Restaurant

| Field | Notes |
|-------|-------|
| `name` | Kitchen display name |
| `isSeeded` | Demo seed flag |

All ingredient and bill data is scoped by `restaurantId`.
