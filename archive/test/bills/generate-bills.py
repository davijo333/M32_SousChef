#!/usr/bin/env python3
"""Generate sample customer and supplier bill PNG/PDF files for Sunrise Diner."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas

ROOT = Path(__file__).parent
CUSTOMER_DIR = ROOT / "customer"
SUPPLIER_DIR = ROOT / "supplier"
CUSTOMER_POS_VENDOR = "Square POS — Sunrise Diner"


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
    format_label: str = ""  # shown on rendered bill for PDF vs photo copy


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


def customer_bills() -> list[Bill]:
  today = date(2026, 6, 22).isoformat()
  return [
    Bill(
      bill_id="SQ-20260622-AM",
      bill_type="customer",
      vendor=CUSTOMER_POS_VENDOR,
      bill_date=today,
      title="Breakfast sandwiches — morning shift",
      filename_stem="square-sandwiches-2026-06-22",
      covers=[
        "mi-custom-croissant+addon-bacon+addon-egg+addon-cheese",
        "mi-custom-bread+addon-sausage+addon-egg",
        "mi-custom-bagel+addon-bacon+addon-veggies",
        "mi-sig-sunrise-stack",
        "mi-sig-garden-morning",
        "mi-sig-farmers-double",
      ],
      lines=[
        BillLine("Sunrise Stack™ — Bacon, Egg, Cheddar on Croissant", "3", "$11.49", "$34.47"),
        BillLine("Garden Morning Croissant — Spinach, Tomato, Avocado", "2", "$10.99", "$21.98"),
        BillLine("Farmer's Double — Sausage, Egg, American on Sourdough", "1", "$12.99", "$12.99"),
        BillLine("Build-Your-Own Croissant — Applewood Bacon, Fried Egg, Swiss", "2", "$11.24", "$22.48"),
        BillLine("Build-Your-Own Sourdough — Breakfast Sausage, Egg", "1", "$10.49", "$10.49"),
        BillLine("Build-Your-Own Bagel — Bacon, Baby Spinach, Tomato", "1", "$11.49", "$11.49"),
      ],
    ),
    Bill(
      bill_id="SQ-20260622-COF",
      bill_type="customer",
      vendor=CUSTOMER_POS_VENDOR,
      bill_date=today,
      title="Coffee bar — specialty drinks",
      filename_stem="square-coffee-2026-06-22",
      covers=[
        "mi-coffee-hot:size-small:milk-none",
        "mi-coffee-hot:size-medium:milk-whole",
        "mi-coffee-hot:size-large:milk-oat:flavor-vanilla",
        "mi-coffee-frappe:size-small:milk-skim",
        "mi-coffee-frappe:size-large:milk-almond:flavor-caramel",
        "mi-coffee-mocha:size-medium:milk-whole:flavor-hazelnut",
        "mi-coffee-cappuccino:size-large:milk-half-and-half:flavor-vanilla",
        "addon-whipped-cream",
      ],
      lines=[
        BillLine("House Hot Coffee 12oz — Black", "2", "$2.97", "$5.94"),
        BillLine("House Hot Coffee 16oz — Land O Lakes Whole Milk", "4", "$3.49", "$13.96"),
        BillLine("House Hot Coffee 20oz — Oatly Oat + Monin Vanilla", "2", "$5.11", "$10.22"),
        BillLine("Iced Skim Milk Frappe 16oz", "1", "$4.67", "$4.67"),
        BillLine("Iced Caramel Frappe 24oz — Califia Almond Milk", "2", "$7.61", "$15.22"),
        BillLine("Dark Chocolate Mocha 16oz — Whole Milk + Monin Hazelnut", "3", "$6.49", "$19.47"),
        BillLine("Classic Cappuccino 20oz — Half & Half + Monin Vanilla", "2", "$6.86", "$13.72"),
        BillLine("Extra Whipped Cream Topping", "2", "$0.75", "$1.50"),
      ],
    ),
    Bill(
      bill_id="TST-20260622-BEV",
      bill_type="customer",
      vendor=CUSTOMER_POS_VENDOR,
      bill_date=today,
      title="Tea, juice & café drinks",
      filename_stem="square-tea-juice-2026-06-22",
      covers=[
        "mi-tea-english:size-small",
        "mi-tea-english:size-medium",
        "mi-tea-english:size-large",
        "mi-tea-green:size-small",
        "mi-tea-green:size-medium",
        "mi-tea-green:size-large",
        "mi-juice-orange:size-small",
        "mi-juice-orange:size-medium",
        "mi-juice-orange:size-large",
        "mi-juice-apple:size-medium",
        "mi-juice-cranberry:size-large",
        "mi-coffee-hot:size-medium:milk-soy",
        "mi-coffee-cappuccino:size-small:milk-skim",
      ],
      lines=[
        BillLine("Taylors English Breakfast Tea 12oz", "1", "$3.29", "$3.29"),
        BillLine("Taylors English Breakfast Tea 16oz", "1", "$3.49", "$3.49"),
        BillLine("Taylors English Breakfast Tea 20oz", "1", "$3.69", "$3.69"),
        BillLine("Twinings Green Tea 12oz / 16oz / 20oz", "3", "$3.29", "$9.87"),
        BillLine("Fresh-Squeezed Orange Juice 12oz / 16oz / 20oz", "3", "$4.49", "$13.47"),
        BillLine("Martinelli's Apple Juice 16oz", "2", "$4.29", "$8.58"),
        BillLine("Ocean Spray Cranberry Juice 20oz", "2", "$5.61", "$11.22"),
        BillLine("House Coffee 16oz — Silk Soy Milk", "1", "$3.49", "$3.49"),
        BillLine("Classic Cappuccino 12oz — Skim Milk", "1", "$4.24", "$4.24"),
      ],
    ),
    Bill(
      bill_id="SQ-20260623-MIX",
      bill_type="customer",
      vendor=CUSTOMER_POS_VENDOR,
      bill_date="2026-06-23",
      title="Afternoon — sandwiches & blended drinks",
      filename_stem="square-mixed-2026-06-23",
      covers=[
        "mi-custom-croissant+addon-veggies",
        "mi-custom-bread+addon-bacon+addon-cheese",
        "mi-custom-bagel+addon-sausage+addon-egg+addon-cheese",
        "mi-coffee-mocha:size-small:milk-oat",
        "mi-coffee-frappe:size-medium:milk-soy:flavor-hazelnut",
      ],
      lines=[
        BillLine("Veggie Croissant — Spinach, Tomato, Bell Pepper", "2", "$10.99", "$21.98"),
        BillLine("Sourdough Melt — Applewood Bacon, Cheddar", "1", "$10.24", "$10.24"),
        BillLine("Loaded Bagel — Sausage, Egg, American Cheese", "1", "$12.24", "$12.24"),
        BillLine("Oat Milk Mocha 12oz", "2", "$5.59", "$11.18"),
        BillLine("Soy Hazelnut Frappe 16oz", "1", "$6.74", "$6.74"),
      ],
    ),
  ]


def supplier_bills() -> list[Bill]:
  return [
    Bill(
      bill_id="SYSCO-4821",
      bill_type="supplier",
      vendor="Sysco Food Services",
      bill_date="2026-06-20",
      title="Invoice #4821 — Bakery, proteins, cheese, produce",
      filename_stem="sysco-bakery-proteins-4821",
      covers=[
        "ing-croissant", "ing-sourdough-bread", "ing-bagel", "ing-bacon", "ing-sausage",
        "ing-egg", "ing-cheddar", "ing-swiss", "ing-american", "ing-butter",
        "ing-spinach", "ing-tomato", "ing-bell-pepper", "ing-avocado",
      ],
      lines=[
        BillLine("Vie de France Butter Croissant 4dz", "4", "$20.40", "$81.60"),
        BillLine("La Brea Bakery Sourdough Loaf 24oz", "14", "$3.20", "$44.80"),
        BillLine("Thomas' Plain Bagels 3dz", "3", "$19.80", "$59.40"),
        BillLine("Tyson Applewood Smoked Bacon 10lb", "2", "$6.49", "$12.98"),
        BillLine("Jimmy Dean Premium Breakfast Sausage 5lb", "3", "$4.89", "$14.67"),
        BillLine("Eggland's Best Large Eggs 15dz", "2", "$42.00", "$84.00"),
        BillLine("Tillamook Medium Cheddar Block 5lb", "2", "$18.50", "$37.00"),
        BillLine("Boar's Head Swiss Cheese Slices 2lb", "2", "$9.80", "$19.60"),
        BillLine("Kraft American Cheese Singles 3lb", "2", "$8.90", "$17.80"),
        BillLine("Land O Lakes Unsalted Butter 1lb", "4", "$4.25", "$17.00"),
        BillLine("Earthbound Farm Organic Baby Spinach 2lb", "3", "$5.40", "$16.20"),
        BillLine("Roma Tomato 5lb case", "2", "$4.10", "$8.20"),
        BillLine("Green Bell Pepper 3lb", "2", "$3.80", "$7.60"),
        BillLine("Hass Avocado 48ct case", "1", "$38.00", "$38.00"),
      ],
    ),
    Bill(
      bill_id="SYSCO-4822",
      bill_type="supplier",
      vendor="Sysco Food Services",
      bill_date="2026-06-20",
      title="Invoice #4822 — Dairy, coffee, syrups, ice",
      filename_stem="sysco-dairy-coffee-4822",
      covers=[
        "ing-coffee-beans", "ing-espresso", "ing-whole-milk", "ing-skim-milk",
        "ing-oat-milk", "ing-almond-milk", "ing-soy-milk", "ing-half-and-half",
        "ing-mocha-syrup", "ing-vanilla-syrup", "ing-caramel-syrup", "ing-hazelnut-syrup",
        "ing-ice", "ing-heavy-cream", "ing-frothing-milk",
      ],
      lines=[
        BillLine("Lavazza Super Crema Espresso Beans 2.2lb", "6", "$14.00", "$84.00"),
        BillLine("Starbucks Pike Place Whole Bean Coffee 5lb", "4", "$12.50", "$50.00"),
        BillLine("Land O Lakes Whole Milk gallon", "8", "$4.20", "$33.60"),
        BillLine("Land O Lakes Skim Milk gallon", "4", "$4.10", "$16.40"),
        BillLine("Oatly Barista Edition Oat Milk 64oz", "6", "$5.80", "$34.80"),
        BillLine("Califia Farms Almond Milk 64oz", "4", "$5.60", "$22.40"),
        BillLine("Silk Original Soy Milk 64oz", "4", "$5.40", "$21.60"),
        BillLine("Land O Lakes Half & Half quart", "6", "$3.20", "$19.20"),
        BillLine("Monin Dark Chocolate Sauce 750ml", "3", "$8.50", "$25.50"),
        BillLine("Monin Vanilla Syrup 750ml", "3", "$7.90", "$23.70"),
        BillLine("Monin Caramel Syrup 750ml", "2", "$7.90", "$15.80"),
        BillLine("Monin Hazelnut Syrup 750ml", "2", "$7.90", "$15.80"),
        BillLine("Reddy Ice Bagged Ice 20lb", "5", "$4.50", "$22.50"),
        BillLine("Land O Lakes Heavy Whipping Cream half-gal", "3", "$7.80", "$23.40"),
        BillLine("Pacific Barista Series Frothing Milk gallon", "2", "$5.90", "$11.80"),
      ],
    ),
    Bill(
      bill_id="COSTCO-90614",
      bill_type="supplier",
      vendor="Costco Business Center",
      bill_date="2026-06-21",
      title="Receipt — Tea, juice & pantry restock",
      filename_stem="costco-beverages-90614",
      covers=["ing-black-tea", "ing-green-tea", "ing-orange-juice", "ing-apple-juice", "ing-cranberry-juice"],
      lines=[
        BillLine("Taylors of Harrogate English Breakfast Tea 100ct", "2", "$12.99", "$25.98"),
        BillLine("Twinings Pure Green Tea Bags 100ct", "2", "$12.99", "$25.98"),
        BillLine("Kirkland Signature Orange Juice 2pk gallon", "4", "$6.49", "$25.96"),
        BillLine("Martinelli's Gold Medal Apple Juice gallon", "3", "$5.99", "$17.97"),
        BillLine("Ocean Spray Cranberry Juice Cocktail 96oz", "4", "$4.89", "$19.56"),
      ],
    ),
    Bill(
      bill_id="USF-77102",
      bill_type="supplier",
      vendor="US Foods Chef'Store",
      bill_date="2026-06-21",
      title="Invoice #77102 — Proteins & dairy case",
      filename_stem="usfoods-proteins-dairy-77102",
      covers=["ing-bacon", "ing-sausage", "ing-egg", "ing-whole-milk", "ing-cheddar", "ing-butter"],
      lines=[
        BillLine("Smithfield Applewood Bacon 15lb case", "1", "$58.90", "$58.90"),
        BillLine("Johnsonville Breakfast Sausage Links 5lb", "2", "$14.25", "$28.50"),
        BillLine("Clover Sonoma Large Eggs 15dz", "1", "$39.50", "$39.50"),
        BillLine("Darigold Whole Milk gallon", "6", "$4.05", "$24.30"),
        BillLine("Tillamook Medium Cheddar 2.5lb loaf", "2", "$11.80", "$23.60"),
        BillLine("Challenge Unsalted Butter 1lb 4pk", "3", "$14.99", "$44.97"),
      ],
    ),
    Bill(
      bill_id="SYSCO-4823",
      bill_type="supplier",
      vendor="Sysco Food Services",
      bill_date="2026-06-21",
      title="Invoice #4823 — Mixed restock",
      filename_stem="sysco-mixed-restock-4823",
      covers=[
        "ing-croissant", "ing-bacon", "ing-egg", "ing-whole-milk", "ing-coffee-beans",
        "ing-spinach", "ing-orange-juice", "ing-vanilla-syrup", "ing-bagel", "ing-cheddar",
      ],
      lines=[
        BillLine("Vie de France Butter Croissant 2dz", "2", "$20.40", "$40.80"),
        BillLine("Tyson Applewood Bacon 5lb", "2", "$6.49", "$12.98"),
        BillLine("Eggland's Best Large Eggs 5dz", "1", "$21.00", "$21.00"),
        BillLine("Land O Lakes Whole Milk gallon", "4", "$4.20", "$16.80"),
        BillLine("Starbucks Pike Place Whole Bean 5lb", "2", "$12.50", "$25.00"),
        BillLine("Earthbound Farm Baby Spinach 2lb", "2", "$5.40", "$10.80"),
        BillLine("Tropicana Pure Premium OJ gallon", "2", "$6.20", "$12.40"),
        BillLine("Monin Vanilla Syrup 750ml", "1", "$7.90", "$7.90"),
        BillLine("Thomas' Plain Bagels 1dz", "2", "$9.90", "$19.80"),
        BillLine("Tillamook Medium Cheddar 2lb", "1", "$18.50", "$18.50"),
      ],
    ),
  ]


def split_bill_halves(source: Bill) -> tuple[Bill, Bill]:
    """Split one logical invoice into two distinct receipts (PDF + PNG halves)."""
    mid = max(1, len(source.lines) // 2)
    first_lines = source.lines[:mid]
    second_lines = source.lines[mid:]
    if not second_lines:
        second_lines = source.lines[-1:]

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


def write_numbered_bill_files(sources: list[Bill], bill_type: str) -> list[dict]:
    """Each source becomes two files: N.type_bill.pdf then (N+1).type_bill.png — unique names & content."""
    folder = CUSTOMER_DIR if bill_type == "customer" else SUPPLIER_DIR
    short = "c" if bill_type == "customer" else "s"
    manifest_rows: list[dict] = []
    counter = 0

    for source in sources:
        pdf_half, png_half = split_bill_halves(source)

        counter += 1
        pdf_path = folder / f"{counter}.{short}_bill.pdf"
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
        png_path = folder / f"{counter}.{short}_bill.png"
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
        "restaurant": "Sunrise Diner",
        "generated": date.today().isoformat(),
        "naming": "Each logical invoice is split into two files: N.c_bill.pdf (first half) and (N+1).c_bill.png (second half). Same pattern for supplier with .s_bill.",
        "customerBills": customer_exports,
        "supplierBills": supplier_exports,
        "coverageNotes": {
            "customer": f"{len(customer_exports)} POS files ({len(customers)} logical receipts × PDF + PNG halves).",
            "supplier": f"{len(supplier_exports)} wholesaler files ({len(suppliers)} logical invoices × PDF + PNG halves).",
        },
    }

    manifest_path = ROOT / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(customer_exports)} customer + {len(supplier_exports)} supplier bill files")
    print(f"Manifest: {manifest_path}")


if __name__ == "__main__":
    main()
