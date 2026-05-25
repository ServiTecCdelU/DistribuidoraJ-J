const fs = require('fs');
const path = require('path');
async function main() {
  const pdfjsLib = await import('pdfjs-dist');
  const pdfPath = path.resolve(__dirname, '..', '0201011-FAB-200700091112.pdf');
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  console.log('Pages:', pdf.numPages);
  for (let i = 1; i <= Math.min(pdf.numPages, 3); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const lineMap = new Map();
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 2) * 2;
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y).push({ x: item.transform[4], str: item.str });
    }
    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
    console.log('--- PAGE', i, '---');
    for (const y of sortedYs) {
      const items = lineMap.get(y).sort((a, b) => a.x - b.x);
      console.log(items.map(i => i.str).join(' '));
    }
  }
}
main().catch(e => console.error(e));
