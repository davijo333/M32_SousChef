#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${NEXTAUTH_URL:-http://localhost:3000}"
EMAIL="${RETEST_EMAIL:-retest@souschef.local}"
PASSWORD="${RETEST_PASSWORD:-retest123}"
COOKIES="$(mktemp)"
trap 'rm -f "$COOKIES"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "OK: $*"; }

echo "==> Full upload retest against $BASE"

# Sign up (ignore if already exists after partial run)
SIGNUP_CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/signup" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"chefName\":\"Retest Chef\",\"kitchenName\":\"Retest Kitchen\"}")
[[ "$SIGNUP_CODE" == "200" || "$SIGNUP_CODE" == "400" ]] || fail "signup HTTP $SIGNUP_CODE"

CSRF=$(curl -s -c "$COOKIES" "$BASE/api/auth/csrf" | python3 -c "import sys,json; print(json.load(sys.stdin)['csrfToken'])")
curl -s -b "$COOKIES" -c "$COOKIES" -X POST "$BASE/api/auth/callback/credentials" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "email=$EMAIL" \
  --data-urlencode "password=$PASSWORD" \
  -o /dev/null -w '' || true

SESSION=$(curl -s -b "$COOKIES" "$BASE/api/auth/session")
echo "$SESSION" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('user') else 1)" \
  || fail "could not sign in"

SEED=$(curl -s -b "$COOKIES" -X POST "$BASE/api/seed")
echo "$SEED" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('ok') or 'Already seeded' in d.get('message','') else 1)" \
  || fail "seed failed: $SEED"
ok "signed in and seeded demo kitchen"

parse_bill() {
  local type="$1"
  local file="$2"
  local name
  name="$(basename "$file")"
  echo "    parsing $type: $name ..."
  local out
  out=$(curl -s -b "$COOKIES" -X POST "$BASE/api/bills/parse" \
    -F "file=@$file" \
    -F "billType=$type")
  echo "$out" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('billId'):
    print(f\"      billId={d['billId']} lines={d.get('lineCount',0)} new_ing={len(d.get('newCatalogItems',{}).get('ingredients',[]))} new_dish={len(d.get('newCatalogItems',{}).get('dishes',[]))}\")
else:
    print('      ERROR:', d.get('error', d), file=sys.stderr)
    sys.exit(1)
" || fail "parse failed for $name"
}

SUPPLIER_DIR="$ROOT/test/bills/supplier"
CUSTOMER_DIR="$ROOT/test/bills/customer"

for f in "$SUPPLIER_DIR"/*.{pdf,png}; do
  [[ -f "$f" ]] || continue
  parse_bill supplier "$f"
done

for f in "$CUSTOMER_DIR"/*.{pdf,png}; do
  [[ -f "$f" ]] || continue
  parse_bill customer "$f"
done

SESSION_BILLS=$(curl -s -b "$COOKIES" "$BASE/api/bills/session")
echo "$SESSION_BILLS" | python3 -c "
import sys, json
d = json.load(sys.stdin)
s = len(d.get('supplier', []))
c = len(d.get('customer', []))
ing = len(d.get('newCatalogItems', {}).get('ingredients', []))
dis = len(d.get('newCatalogItems', {}).get('dishes', []))
print(f'  session: {s} supplier + {c} customer bills; {ing} new ingredients, {dis} new dishes to review')
if s == 0 and c == 0:
    sys.exit(1)
" || fail "session restore empty"

ok "all test bills parsed — open $BASE/upload-bills to review"
