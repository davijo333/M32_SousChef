# Login / Signup

Auth entry point for Sous Chef. Required by the M32 assessment; Google OAuth is a stretch bonus.

## Purpose

Let café owners create an account, sign in, and reach their restaurant workspace. No setup wizard here — after signup, users land on the dashboard and cold-start via bill uploads.

## Route

| Screen | Route |
|--------|-------|
| Login | `/login` |
| Signup | `/signup` |

## Layout

- Centered card on a calm, neutral background (cream / charcoal per brand)
- Sous Chef logo + tagline: *Your AI sous chef for menu & inventory.*
- Large, readable form fields (16px+ text) for 35+ non-technical users
- Single primary CTA per screen

## Login

**Fields**
- Email
- Password

**Actions**
- **Sign in** → redirect to `/dashboard`
- Link to signup
- (Stretch) **Continue with Google**

**States**
- Loading spinner on submit
- Inline error for invalid credentials
- Remember session via secure cookie / JWT

## Signup

**Fields**
- Chef name (your name — used in greetings and chat)
- Email
- Password
- Confirm password

**Actions**
- **Create account** → creates chef + empty shared `Restaurant` (default name "My Diner") → redirect to `/dashboard`
- Link to login

**Validation**
- Email format
- Password minimum length
- Passwords match
- Chef name required

**v2 (not in MVP):** multiple chefs per restaurant, invite/join flow, shared inventory when linked to same `restaurantId`.

## Post-auth behavior

```
Signup → empty Restaurant created → Dashboard (onboarding CTA: upload supplier bill)
Login  → Dashboard (existing data)
```

## Out of scope (MVP)

- Multi-location / multiple restaurants per user
- Email verification flow
- Password reset (nice-to-have if time allows)

## Related pages

- [Dashboard](./dashboard.md) — landing after auth
- [Upload Bills](./upload-bills.md) — primary cold-start action
