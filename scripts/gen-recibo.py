# -*- coding: utf-8 -*-
"""Recibo de pago — A4 horizontal, dos copias lado a lado (canvas reportlab)."""
import os
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4, landscape

PAGE_W, PAGE_H = landscape(A4)  # 841.89 x 595.28
HALF_W = PAGE_W / 2
MARGIN = 20

GRAY = (0.5, 0.5, 0.5)
RED = (0.85, 0.1, 0.1)
BLACK = (0, 0, 0)

DATA = {
    "empresa": "Distribuidora J&J",
    "numero": "transaccion_fernandezsofia_3",
    "fecha": "16/06/2026",
    "hora": "01:32 p. m.",
    "cliente": "FERNANDEZ SOFIA",
    "direccion": "HENRY 2459",
    "monto": 145668.00,
    "forma_pago": "Pago en efectivo",
    "saldo_anterior": 2224994.49,
    "este_pago": 145668.00,
    "saldo_actual": 2079326.49,
}


def ars(v):
    s = f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"$ {s}"


def draw_scissors(c, xc, y):
    """Tijera simple dibujada con vectores (sin chars Unicode)."""
    c.saveState()
    c.setLineWidth(0.8)
    c.setStrokeColorRGB(*GRAY)
    # dos hojas cruzadas
    c.line(xc - 6, y + 5, xc + 4, y - 3)
    c.line(xc + 6, y + 5, xc - 4, y - 3)
    # dos aros (mangos)
    c.circle(xc - 5, y - 5, 2.2, stroke=1, fill=0)
    c.circle(xc + 5, y - 5, 2.2, stroke=1, fill=0)
    c.restoreState()


def text(c, x, y, s, size=8, bold=False, color=BLACK, center=False, xc=None):
    c.setFillColorRGB(*color)
    c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
    if center:
        c.drawCentredString(xc, y, s)
    else:
        c.drawString(x, y, s)


def sep(c, x0, x1, y, color=GRAY, width=0.5):
    c.setStrokeColorRGB(*color)
    c.setLineWidth(width)
    c.line(x0, y, x1, y)


def draw_receipt(c, x0, copia, rol):
    left = x0 + MARGIN
    right = x0 + HALF_W - MARGIN
    xc = x0 + HALF_W / 2
    y = PAGE_H - MARGIN - 8

    # Header
    text(c, 0, y, DATA["empresa"], size=14, bold=True, center=True, xc=xc)
    y -= 12
    text(c, 0, y, "Comprobante de pago — no válido como factura", size=7, color=GRAY, center=True, xc=xc)
    y -= 11
    text(c, 0, y, f"{copia} · {rol}", size=7, bold=True, color=GRAY, center=True, xc=xc)
    y -= 12

    # Título grande con líneas arriba/abajo
    sep(c, left, right, y, color=BLACK, width=0.8)
    y -= 18
    text(c, 0, y, "RECIBO DE PAGO", size=16, bold=True, center=True, xc=xc)
    y -= 8
    sep(c, left, right, y, color=BLACK, width=0.8)
    y -= 18

    # N°
    text(c, left, y, f"N°   {DATA['numero']}", size=8)
    y -= 14
    # Fecha / Hora en una fila
    text(c, left, y, f"Fecha   {DATA['fecha']}      Hora   {DATA['hora']}", size=8)
    y -= 16
    # Recibí de
    text(c, left, y, "Recibí de:   ", size=9)
    w = c.stringWidth("Recibí de:   ", "Helvetica", 9)
    text(c, left + w, y, DATA["cliente"], size=9, bold=True)
    y -= 14
    # Dirección
    text(c, left, y, f"Dirección:   {DATA['direccion']}", size=9)
    y -= 24

    # Monto destacado con borde
    box_h = 30
    c.setStrokeColorRGB(*BLACK)
    c.setLineWidth(1)
    c.rect(left, y - box_h + 8, right - left, box_h, stroke=1, fill=0)
    text(c, 0, y - 8, ars(DATA["monto"]), size=20, bold=True, center=True, xc=xc)
    y -= box_h + 12

    # Forma de pago
    text(c, left, y, f"Forma de pago:   {DATA['forma_pago']}", size=9)
    y -= 12
    sep(c, left, right, y)
    y -= 16

    # Tabla de saldos
    def fila(label, valor, color=BLACK, bold=False):
        nonlocal y
        text(c, left, y, label, size=9)
        # monto alineado a la derecha
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 9)
        c.setFillColorRGB(*color)
        c.drawRightString(right, y, valor)
        y -= 14

    fila("Saldo anterior", ars(DATA["saldo_anterior"]))
    fila("Este pago", "- " + ars(DATA["este_pago"]), color=RED)
    fila("Saldo actual", ars(DATA["saldo_actual"]), bold=True)

    y -= 4
    sep(c, left, right, y)
    y -= 18

    # Firma
    text(c, left, y, "Firma y aclaración: ___________________________", size=8)

    # Footer al pie
    text(c, 0, MARGIN, f"{DATA['numero']} · {copia}", size=7, color=GRAY, center=True, xc=xc)


def main():
    out_dir = os.path.join(os.path.dirname(__file__), "..", "outputs")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.abspath(os.path.join(out_dir, "recibo-transaccion_fernandezsofia_3.pdf"))

    c = canvas.Canvas(out, pagesize=(PAGE_W, PAGE_H))

    # Izquierda: ORIGINAL · Cliente
    draw_receipt(c, 0, "ORIGINAL", "Cliente")
    # Derecha: DUPLICADO · Comercio
    draw_receipt(c, HALF_W, "DUPLICADO", "Comercio")

    # Línea punteada vertical al centro + tijera arriba
    c.setStrokeColorRGB(*GRAY)
    c.setLineWidth(0.6)
    c.setDash(3, 3)
    c.line(HALF_W, MARGIN + 6, HALF_W, PAGE_H - MARGIN - 14)
    c.setDash()
    draw_scissors(c, HALF_W, PAGE_H - MARGIN - 6)

    c.showPage()
    c.save()
    print("OK:", out)


if __name__ == "__main__":
    main()
