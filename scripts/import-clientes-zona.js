// Script para importar/actualizar clientes desde clientes_Nueva Zona.csv
// Uso: node scripts/import-clientes-zona.js

const fs = require('fs');
const path = require('path');

// Leer .env
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=["']?([^"'\r]*)["']?/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Faltan variables SUPABASE en .env');
  process.exit(1);
}

// Helper para llamar a Supabase REST API
async function supabaseGet(table, params = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`GET ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function supabaseInsert(table, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`INSERT ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function supabaseUpdate(table, id, updates) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`UPDATE ${table} ${id}: ${res.status} ${await res.text()}`);
  return res.json();
}

function slugify(text) {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function normalize(s) {
  return (s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

async function generateId(existingIds, name) {
  const slug = slugify(name);
  const base = `cliente_${slug}`;
  let num = 1;
  while (num < 1000) {
    const id = `${base}_${num}`;
    if (!existingIds.has(id)) {
      existingIds.add(id);
      return id;
    }
    num++;
  }
  throw new Error(`No se pudo generar ID para ${name}`);
}

async function main() {
  // 1. Leer CSV
  const csvPath = path.join(__dirname, '..', 'clientes_Nueva Zona.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n').filter(l => l.trim());

  // Skip header
  const csvClients = lines.slice(1).map(line => {
    const [nombre, direccion] = line.split(';').map(s => (s || '').trim());
    return { nombre, direccion };
  }).filter(c => c.nombre);

  console.log(`CSV: ${csvClients.length} clientes leídos`);

  // 2. Traer clientes existentes
  const existing = await supabaseGet('clientes', 'select=id,name,address&order=name.asc&limit=5000');
  console.log(`BD: ${existing.length} clientes existentes`);

  const existingIds = new Set(existing.map(c => c.id));

  // Indexar por nombre normalizado
  const byName = new Map();
  for (const c of existing) {
    byName.set(normalize(c.name), c);
  }

  let updated = 0;
  let created = 0;
  let skipped = 0;

  for (const csv of csvClients) {
    const normName = normalize(csv.nombre);
    const match = byName.get(normName);

    if (match) {
      // Cliente existe — actualizar dirección si cambió
      const currentAddr = (match.address || '').trim();
      const newAddr = csv.direccion.trim();

      if (currentAddr !== newAddr && newAddr) {
        await supabaseUpdate('clientes', match.id, { address: newAddr });
        console.log(`  ACTUALIZADO: "${match.name}" — dirección: "${currentAddr}" → "${newAddr}"`);
        updated++;
      } else {
        skipped++;
      }
    } else {
      // Cliente no existe — crear
      const id = await generateId(existingIds, csv.nombre);
      const row = {
        id,
        name: csv.nombre,
        address: csv.direccion,
        tax_category: 'consumidor_final',
        credit_limit: 0,
        current_balance: 0,
        addresses: [],
      };
      await supabaseInsert('clientes', row);
      console.log(`  CREADO: "${csv.nombre}" — ${csv.direccion}`);
      created++;
    }
  }

  console.log(`\n--- RESUMEN ---`);
  console.log(`Actualizados: ${updated}`);
  console.log(`Creados: ${created}`);
  console.log(`Sin cambios: ${skipped}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
