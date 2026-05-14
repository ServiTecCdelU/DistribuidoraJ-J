import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase-admin";

export async function POST(req: Request) {
  try {
    const { productos } = await req.json();

    if (!Array.isArray(productos) || productos.length === 0) {
      return NextResponse.json(
        { error: "Se requiere un array de productos" },
        { status: 400 }
      );
    }

    let count = 0;
    let batch = adminFirestore.batch();
    let batchCount = 0;

    for (const producto of productos) {
      if (!producto.codigo || !producto.nombre) continue;

      const docRef = adminFirestore.collection("productos").doc();
      batch.set(docRef, {
        name: producto.nombre.trim(),
        description: producto.nombre.trim(),
        codigo: producto.codigo.trim(),
        price: 0,
        stock: 0,
        imageUrl: "",
        category: producto.categoria || "Sin categoría",
        base: "crema",
        marca: "Sin identificar",
        sinTacc: false,
        disabled: false,
        createdAt: new Date(),
      });
      count++;
      batchCount++;

      if (batchCount === 499) {
        await batch.commit();
        batch = adminFirestore.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    return NextResponse.json({ success: true, imported: count });
  } catch (error: unknown) {
    console.error("Error importing productos:", error);
    return NextResponse.json(
      { error: "Error al importar productos" },
      { status: 500 }
    );
  }
}
