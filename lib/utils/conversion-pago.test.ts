import { describe, it, expect } from "vitest";
import { camposConversionPago } from "./conversion-pago";

describe("camposConversionPago", () => {
  it("a pagado en efectivo: registra el monto en efectivo y limpia transferencia", () => {
    expect(camposConversionPago("aPagado", 1000, "efectivo")).toEqual({
      payment_type: "cash",
      payment_method: "efectivo",
      cash_amount: null,
      credit_amount: null,
      efectivo_amount: 1000,
      transferencia_amount: null,
    });
  });

  it("a pagado por transferencia: registra el monto en transferencia y limpia efectivo", () => {
    expect(camposConversionPago("aPagado", 1000, "transferencia")).toEqual({
      payment_type: "cash",
      payment_method: "transferencia",
      cash_amount: null,
      credit_amount: null,
      efectivo_amount: null,
      transferencia_amount: 1000,
    });
  });

  // Caso real: el repartidor registra en transferencia, el admin lo pasa a cuenta corriente.
  // Si transferencia_amount queda con el monto viejo, la caja sigue contando plata que no entró.
  it("a cuenta corriente: borra los montos cobrados, no entró plata", () => {
    expect(camposConversionPago("aCuentaCorriente", 1000)).toEqual({
      payment_type: "credit",
      credit_amount: 1000,
      cash_amount: null,
      efectivo_amount: null,
      transferencia_amount: null,
    });
  });

  // Al pasar de vuelta a pagado, el método puede ser distinto del original.
  // El monto del medio anterior tiene que quedar en null o se cuenta dos veces.
  it("al cambiar de método no deja residuo del medio anterior", () => {
    const aEfectivo = camposConversionPago("aPagado", 500, "efectivo");
    expect(aEfectivo.transferencia_amount).toBeNull();
    expect(aEfectivo.efectivo_amount).toBe(500);

    const aTransferencia = camposConversionPago("aPagado", 500, "transferencia");
    expect(aTransferencia.efectivo_amount).toBeNull();
    expect(aTransferencia.transferencia_amount).toBe(500);
  });

  it("sin método explícito asume efectivo", () => {
    const r = camposConversionPago("aPagado", 250);
    expect(r.payment_method).toBe("efectivo");
    expect(r.efectivo_amount).toBe(250);
    expect(r.transferencia_amount).toBeNull();
  });

  it("redondea el monto a dos decimales", () => {
    expect(camposConversionPago("aPagado", 100.005, "efectivo").efectivo_amount).toBe(100.01);
    expect(camposConversionPago("aCuentaCorriente", 100.004).credit_amount).toBe(100);
  });
});
