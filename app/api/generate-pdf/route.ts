import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let browser;

  try {
    const body = await request.json();
    const { html, filename } = body;

    if (!html) {
      return NextResponse.json(
        { error: "HTML no proporcionado" },
        { status: 400 },
      );
    }

    const isProduction = process.env.NODE_ENV === "production";
    const isVercel = !!process.env.VERCEL;

    if (isProduction && isVercel) {
      const chromium = (await import("@sparticuz/chromium")).default;
      const puppeteerCore = (await import("puppeteer-core")).default;

      // v143 incluye el binario en el paquete (bin/chromium.br); sin URL de pack.
      const executablePath = await chromium.executablePath();

      browser = await puppeteerCore.launch({
        args: [
          ...chromium.args,
          "--disable-gpu",
          "--disable-dev-shm-usage",
          "--disable-setuid-sandbox",
          "--no-sandbox",
          "--no-zygote",
          "--single-process",
        ],
        defaultViewport: chromium.defaultViewport,
        executablePath,
        headless: true,
      });
    } else {
      const puppeteerFull = (await import("puppeteer")).default;
      browser = await puppeteerFull.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    }

    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123 });

    await page.setContent(html, {
      waitUntil: ["load", "networkidle0"],
      timeout: 30000,
    });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true,
    });

    const pdfBase64 = Buffer.from(pdfBuffer).toString("base64");

    await browser.close();

    return NextResponse.json({
      success: true,
      pdf: pdfBase64,
      filename: filename || "document.pdf",
      size: pdfBuffer.length,
    });
  } catch (error: any) {
    console.error("[PDF API] Error:", error);
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
    return NextResponse.json(
      { error: error.message || "Error generando PDF" },
      { status: 500 },
    );
  }
}
