import { describe, it, expect } from "vitest";
import { normalizeArgPhone, buildDebtWhatsappUrl } from "../utils/whatsapp";

describe("normalizeArgPhone", () => {
  it("agrega 549 a un celular local sin prefijo", () => {
    expect(normalizeArgPhone("3541123456")).toBe("5493541123456");
  });

  it("saca el 0 de larga distancia", () => {
    expect(normalizeArgPhone("03541123456")).toBe("5493541123456");
  });

  it("normaliza un número con código de área completo", () => {
    expect(normalizeArgPhone("3514123456")).toBe("5493514123456");
  });

  it("respeta un número que ya viene con 54 y le asegura el 9", () => {
    expect(normalizeArgPhone("543541123456")).toBe("5493541123456");
    expect(normalizeArgPhone("5493541123456")).toBe("5493541123456");
  });

  it("ignora caracteres no numéricos (espacios, guiones, paréntesis, +)", () => {
    expect(normalizeArgPhone("+54 9 3541 12-3456")).toBe("5493541123456");
  });

  it("devuelve null para entradas inválidas", () => {
    expect(normalizeArgPhone("")).toBeNull();
    expect(normalizeArgPhone(null)).toBeNull();
    expect(normalizeArgPhone("123")).toBeNull();
  });
});

describe("buildDebtWhatsappUrl", () => {
  it("arma la URL wa.me con el número normalizado y el saldo", () => {
    const url = buildDebtWhatsappUrl({ phone: "3541123456", clientName: "Kiosco A", balance: 1500, montoFormateado: "$ 1.500" });
    expect(url).toContain("https://wa.me/5493541123456?text=");
    const texto = decodeURIComponent(url!);
    expect(texto).toContain("Hola Kiosco A");
    expect(texto).toContain("$ 1.500");
  });

  it("devuelve null si no hay saldo a reclamar", () => {
    expect(buildDebtWhatsappUrl({ phone: "3541123456", clientName: "A", balance: 0, montoFormateado: "$ 0" })).toBeNull();
    expect(buildDebtWhatsappUrl({ phone: "3541123456", clientName: "A", balance: -100, montoFormateado: "-$ 100" })).toBeNull();
  });

  it("devuelve null si el teléfono es inválido", () => {
    expect(buildDebtWhatsappUrl({ phone: "", clientName: "A", balance: 1500, montoFormateado: "$ 1.500" })).toBeNull();
  });
});
