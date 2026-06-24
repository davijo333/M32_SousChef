#!/usr/bin/env python3
"""Generate sample customer and supplier bill PNG/PDF files for Panera Cafe.

Output: test/bills/customer/ and test/bills/supplier/
Run from repo root: python3 test/scripts/generate-bills.py
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas

TEST_ROOT = Path(__file__).resolve().parent.parent
INVENTORY_ROOT = TEST_ROOT / "inventory"
BILLS_ROOT = TEST_ROOT / "bills"
CUSTOMER_DIR = BILLS_ROOT / "customer"
SUPPLIER_DIR = BILLS_ROOT / "supplier"
CUSTOMER_POS_VENDOR = "Square POS — Panera Cafe"


SEED_PERIOD_DAYS = 30
SEED_END_DAYS_AGO = 7
BILL_PERIOD_DAYS = 7
BILL_MAX_DAYS_AGO = BILL_PERIOD_DAYS  # billDay 0 = today, billDay 7 = today − 7


def clamp_day(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, round(value)))


def resolve_bill_date(order: dict) -> str:
    if order.get("billDay") is not None:
        days_ago = clamp_day(int(order["billDay"]), 0, BILL_MAX_DAYS_AGO)
    elif order.get("daysAgo") is not None:
        days_ago = clamp_day(int(order["daysAgo"]), 0, BILL_MAX_DAYS_AGO)
    else:
        days_ago = 0
    return (date.today() - timedelta(days=days_ago)).isoformat()


@dataclass
class BillLine:
    description: str
    qty: str
    unit_price: str
    total: str


@dataclass
class Bill:
    bill_id: str
    bill_type: str  # customer | supplier
    vendor: str
    bill_date: str
    title: str
    lines: list[BillLine]
    covers: list[str]
    filename_stem: str = ""
    format_label: str = ""


def po_line(description: str, qty: int | float, unit_price: float) -> BillLine:
    """Purchase order line with computed total — qty is bulk restaurant scale."""
    total = float(qty) * unit_price
    q = str(int(qty)) if float(qty) == int(qty) else f"{qty:g}"
    return BillLine(description, q, f"${unit_price:.2f}", f"${total:.2f}")


def pos_line(description: str, qty: int, unit_price: float) -> BillLine:
    total = qty * unit_price
    return BillLine(description, str(qty), f"${unit_price:.2f}", f"${total:.2f}")


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for name in ("DejaVuSans.ttf", "Arial.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def render_bill_image(bill: Bill, out_path: Path) -> None:
    width, height = 850, max(1100, 180 + len(bill.lines) * 28)
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)
    title_font = load_font(22)
    head_font = load_font(14)
    body_font = load_font(12)
    mono_font = load_font(11)

    y = 40
    draw.text((40, y), bill.vendor, fill="black", font=title_font)
    y += 34
    draw.text((40, y), bill.title, fill="#333333", font=head_font)
    y += 22
    if bill.format_label:
        draw.text((40, y), bill.format_label, fill="#666666", font=body_font)
        y += 20
    draw.text((40, y), f"Date: {bill.bill_date}    ID: {bill.bill_id}", fill="#555555", font=body_font)
    y += 30
    draw.line([(40, y), (width - 40, y)], fill="#cccccc", width=1)
    y += 16
    draw.text((40, y), "Item", fill="black", font=head_font)
    draw.text((420, y), "Qty", fill="black", font=head_font)
    draw.text((500, y), "Price", fill="black", font=head_font)
    draw.text((620, y), "Total", fill="black", font=head_font)
    y += 24

    subtotal = 0.0
    for line in bill.lines:
        draw.text((40, y), line.description[:52], fill="black", font=body_font)
        draw.text((420, y), line.qty, fill="black", font=mono_font)
        draw.text((500, y), line.unit_price, fill="black", font=mono_font)
        draw.text((620, y), line.total, fill="black", font=mono_font)
        try:
            subtotal += float(line.total.replace("$", ""))
        except ValueError:
            pass
        y += 26

    y += 10
    draw.line([(40, y), (width - 40, y)], fill="#cccccc", width=1)
    y += 14
    draw.text((500, y), f"Subtotal: ${subtotal:.2f}", fill="black", font=head_font)
    y += 22
    draw.text((500, y), f"Tax: ${subtotal * 0.08:.2f}", fill="black", font=body_font)
    y += 22
    draw.text((500, y), f"Total: ${subtotal * 1.08:.2f}", fill="black", font=title_font)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, "PNG")


def render_bill_pdf(bill: Bill, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(out_path), pagesize=letter)
    width, height = letter
    x = 0.75 * inch
    y = height - 0.75 * inch

    c.setFont("Helvetica-Bold", 16)
    c.drawString(x, y, bill.vendor)
    y -= 22
    c.setFont("Helvetica", 12)
    c.drawString(x, y, bill.title)
    y -= 16
    if bill.format_label:
        c.drawString(x, y, bill.format_label)
        y -= 14
    c.drawString(x, y, f"Date: {bill.bill_date}    ID: {bill.bill_id}")
    y -= 24
    c.line(x, y, width - x, y)
    y -= 18
    c.setFont("Helvetica-Bold", 10)
    c.drawString(x, y, "Item")
    c.drawString(x + 4.2 * inch, y, "Qty")
    c.drawString(x + 4.8 * inch, y, "Price")
    c.drawString(x + 5.5 * inch, y, "Total")
    y -= 16
    c.setFont("Helvetica", 9)

    subtotal = 0.0
    for line in bill.lines:
        if y < 1.2 * inch:
            c.showPage()
            y = height - 0.75 * inch
            c.setFont("Helvetica", 9)
        c.drawString(x, y, line.description[:60])
        c.drawString(x + 4.2 * inch, y, line.qty)
        c.drawString(x + 4.8 * inch, y, line.unit_price)
        c.drawString(x + 5.5 * inch, y, line.total)
        try:
            subtotal += float(line.total.replace("$", ""))
        except ValueError:
            pass
        y -= 14

    y -= 8
    c.line(x, y, width - x, y)
    y -= 16
    c.setFont("Helvetica-Bold", 11)
    c.drawString(x + 4.5 * inch, y, f"Subtotal: ${subtotal:.2f}")
    y -= 14
    c.drawString(x + 4.5 * inch, y, f"Tax: ${subtotal * 0.08:.2f}")
    y -= 14
    c.drawString(x + 4.5 * inch, y, f"Total: ${subtotal * 1.08:.2f}")
    c.save()


def load_inventory() -> tuple[dict, dict, dict, dict]:
    dishes_doc = json.loads((INVENTORY_ROOT / "dishes.json").read_text(encoding="utf-8"))
    addons_doc = json.loads((INVENTORY_ROOT / "add-ons.json").read_text(encoding="utf-8"))
    po_doc = json.loads((INVENTORY_ROOT / "purchase-orders.json").read_text(encoding="utf-8"))
    so_doc = json.loads((INVENTORY_ROOT / "sales-orders.json").read_text(encoding="utf-8"))
    return po_doc, so_doc, dishes_doc, addons_doc


def customer_bills() -> list[Bill]:
    """POS sales — line text from test/inventory/sales-orders.json."""
    _, so_doc, dishes_doc, addons_doc = load_inventory()
    dish_by_slug = {d["slug"]: d for d in dishes_doc.get("dishes", [])}
    addon_by_slug = {a["slug"]: a for a in addons_doc.get("addOns", [])}
    bills: list[Bill] = []

    for order in so_doc.get("salesOrders", []):
        lines: list[BillLine] = []
        covers: list[str] = []
        for line in order.get("lines", []):
            if line.get("addOnSlug"):
                addon = addon_by_slug.get(line["addOnSlug"], {})
                covers.append(line["addOnSlug"])
                pos_name = line.get("posName", addon.get("posName", line["addOnSlug"]))
            else:
                dish = dish_by_slug.get(line.get("dishSlug", ""), {})
                menu_id = dish.get("menuId", line.get("dishSlug", ""))
                covers.append(menu_id)
                pos_name = line.get("posName", dish.get("posName", line.get("dishSlug", "")))
            lines.append(pos_line(pos_name, int(line["qty"]), float(line["unitPrice"])))

        bills.append(
            Bill(
                bill_id=order["id"],
                bill_type="customer",
                vendor=so_doc.get("posVendor", CUSTOMER_POS_VENDOR),
                bill_date=resolve_bill_date(order),
                title=order.get("title", order["id"]),
                covers=covers,
                lines=lines,
            )
        )
    return bills


def supplier_bills() -> list[Bill]:
    """Wholesaler invoices — lines from test/inventory/purchase-orders.json."""
    po_doc, _, _, _ = load_inventory()
    bills: list[Bill] = []

    for order in po_doc.get("purchaseOrders", []):
        lines = [
            po_line(line["description"], line["qty"], float(line["unitPrice"]))
            for line in order.get("lines", [])
        ]
        covers: list[str] = []
        for line in order.get("lines", []):
            covers.extend(line.get("ingredientSlugs", []))

        bills.append(
            Bill(
                bill_id=order["id"],
                bill_type="supplier",
                vendor=order["vendor"],
                bill_date=resolve_bill_date(order),
                title=order.get("title", order["id"]),
                covers=covers,
                lines=lines,
            )
        )
    return bills



def split_bill_halves(source: Bill) -> tuple[Bill, Bill]:
    mid = max(1, len(source.lines) // 2)
    first_lines = source.lines[:mid]
    second_lines = source.lines[mid:] or source.lines[-1:]

    first = Bill(
        bill_id=f"{source.bill_id}-A",
        bill_type=source.bill_type,
        vendor=source.vendor,
        bill_date=source.bill_date,
        title=f"{source.title} — lines 1–{len(first_lines)}",
        lines=first_lines,
        covers=source.covers,
        format_label="Supplier invoice — PDF copy" if source.bill_type == "supplier" else "POS receipt — PDF copy",
    )
    second = Bill(
        bill_id=f"{source.bill_id}-B",
        bill_type=source.bill_type,
        vendor=source.vendor,
        bill_date=source.bill_date,
        title=f"{source.title} — lines {len(first_lines) + 1}–{len(source.lines)}",
        lines=second_lines,
        covers=source.covers,
        format_label="Supplier invoice — photo scan" if source.bill_type == "supplier" else "POS receipt — photo scan",
    )
    return first, second


def vendor_filename_slug(vendor: str) -> str:
    lower = vendor.lower()
    if "sysco" in lower:
        return "Sysco"
    if "costco" in lower:
        return "Costco"
    if "us foods" in lower:
        return "US-Foods"
    return "Vendor"


def write_numbered_bill_files(sources: list[Bill], bill_type: str) -> list[dict]:
    folder = CUSTOMER_DIR if bill_type == "customer" else SUPPLIER_DIR
    short = "c" if bill_type == "customer" else "s"
    manifest_rows: list[dict] = []
    counter = 0

    for source in sources:
        pdf_half, png_half = split_bill_halves(source)

        counter += 1
        if bill_type == "supplier":
            slug = vendor_filename_slug(source.vendor)
            pdf_path = folder / f"Bill-{counter}_{slug}.pdf"
            png_path = folder / f"Bill-{counter + 1}_{slug}.png"
        else:
            pdf_path = folder / f"{counter}.{short}_bill.pdf"
            png_path = folder / f"{counter + 1}.{short}_bill.png"

        render_bill_pdf(pdf_half, pdf_path)
        manifest_rows.append(
            {
                "number": counter,
                "id": pdf_half.bill_id,
                "type": bill_type,
                "format": "pdf",
                "filename": pdf_path.name,
                "vendor": pdf_half.vendor,
                "date": pdf_half.bill_date,
                "title": pdf_half.title,
                "parentId": source.bill_id,
                "covers": source.covers,
                "lineCount": len(pdf_half.lines),
            }
        )

        counter += 1
        render_bill_image(png_half, png_path)
        manifest_rows.append(
            {
                "number": counter,
                "id": png_half.bill_id,
                "type": bill_type,
                "format": "png",
                "filename": png_path.name,
                "vendor": png_half.vendor,
                "date": png_half.bill_date,
                "title": png_half.title,
                "parentId": source.bill_id,
                "covers": source.covers,
                "lineCount": len(png_half.lines),
            }
        )

    return manifest_rows


def clear_old_bill_files() -> None:
    for folder in (CUSTOMER_DIR, SUPPLIER_DIR):
        if not folder.exists():
            continue
        for path in folder.iterdir():
            if path.suffix.lower() in {".png", ".pdf"}:
                path.unlink()


def main() -> None:
    CUSTOMER_DIR.mkdir(parents=True, exist_ok=True)
    SUPPLIER_DIR.mkdir(parents=True, exist_ok=True)
    clear_old_bill_files()

    customers = customer_bills()
    suppliers = supplier_bills()
    customer_exports = write_numbered_bill_files(customers, "customer")
    supplier_exports = write_numbered_bill_files(suppliers, "supplier")

    manifest = {
        "restaurant": "Panera Cafe",
        "generated": date.today().isoformat(),
        "naming": "Supplier: Bill-N_Vendor.pdf/png (Bill-1_Sysco … Bill-10_Sysco). Customer: N.c_bill.pdf/png.",
        "inventorySource": str(INVENTORY_ROOT.relative_to(TEST_ROOT.parent)),
        "customerBills": customer_exports,
        "supplierBills": supplier_exports,
        "coverageNotes": {
            "customer": f"{len(customer_exports)} POS files — modest sale qty per line.",
            "supplier": f"{len(supplier_exports)} wholesaler files — bulk qty for pantry headroom after sales.",
        },
    }

    manifest_path = BILLS_ROOT / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(customer_exports)} customer + {len(supplier_exports)} supplier bill files")
    print(f"  supplier → {SUPPLIER_DIR}")
    print(f"  customer → {CUSTOMER_DIR}")
    print(f"  manifest → {manifest_path}")


if __name__ == "__main__":
    main()
