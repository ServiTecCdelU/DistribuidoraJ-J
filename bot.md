# Bot de Instagram — Venta del sistema (ServiTec)

> Estado: **PLANIFICADO, sin construir todavía.** Retomar desde "Próximo paso".

## Objetivo

Bot que responde mensajes de Instagram automáticamente para **vender el sistema de gestión** (este proyecto) a nuevas distribuidoras/comercios. No es para clientes de Patricia. Capta interesados (leads) y los guarda para contactarlos.

## Modelo comercial a comunicar

- **Pago inicial único** de setup (afinar/configurar el sistema al negocio del cliente).
- **Abono mensual de $200.000 por sucursal.**
- Estrategia: NO tirar el precio de entrada. Primero enganchar, mostrar valor + video, y dar el precio cuando el interesado ya está interesado.

## Qué hace el bot

- Responde dudas sobre el sistema (stock, ventas, pedidos, facturación AFIP, cuenta corriente, caja, comisiones, tienda online).
- Manda el **video** publicado del sistema.
- No hay demo pre-configurada (cada cliente se adapta a su negocio) → el bot ofrece coordinar videollamada.
- Capta el lead (nombre, negocio, WhatsApp, zona) y lo guarda en **Google Sheets**.

## Arquitectura

```
Cliente escribe en IG
      ↓
Instagram (Meta) → webhook → /api/instagram/webhook (Vercel)
      ↓
Claude (IA) con guion de venta + memoria de la charla (Supabase)
      ↓
Responde por la API de IG  +  guarda lead en Google Sheets
```

- Sin conexión a la base de Patricia (es venta del software, no productos).
- Claude vía `fetch` directo a la API de Anthropic (NO instalar `@anthropic-ai/sdk`).
- Google Sheets vía `googleapis` (ya instalado) reutilizando el OAuth de Google del backup de Drive. **Ojo:** el refresh token actual es scope Drive; quizá haya que re-autorizar agregando scope `spreadsheets`.

## Plan en 3 fases

### Fase 1 — Construcción (código, en el proyecto)
Archivos a crear:
- `app/api/instagram/webhook/route.ts` — GET (verificación de Meta) + POST (recibe mensajes)
- `lib/instagram/sales-agent.ts` — llamada a Claude con system prompt = guion de venta
- `lib/instagram/send-message.ts` — envío de respuesta por IG Send API
- `lib/instagram/leads-sheet.ts` — append del lead a la planilla de Google
- Persistencia de historial de conversación en tabla `ig_conversaciones`

### Fase 2 — Setup de Meta (lo hace el usuario, en paralelo, tarda semanas)
1. Cuenta de Instagram Profesional (Business/Creator) vinculada a una Página de Facebook.
2. App en developers.facebook.com → agregar producto "Messenger" / "Instagram".
3. App Review de permisos `instagram_manage_messages` + `instagram_basic` (Meta pide video explicando el uso).
4. Conseguir tokens: Page Access Token, App Secret, Verify Token.
5. Mientras tanto se prueba en **modo desarrollador** con la cuenta propia.

### Fase 3 — Go live
Cargar tokens en Vercel y activar.

## Pendientes del usuario (bloqueantes para arrancar Fase 1)

- [ ] Correr el SQL de abajo en Supabase.
- [ ] Pasar el **link del video** publicado.
- [ ] Pasar el **ID de la planilla** de Google (o pedir que se cree una nueva).
- [ ] Crear cuenta en console.anthropic.com y conseguir `ANTHROPIC_API_KEY` (tiene costo por uso, centavos por conversación).

## SQL a ejecutar en Supabase (antes del código)

```sql
create table if not exists ig_conversaciones (
  id bigint generated always as identity primary key,
  sender_id text not null,
  rol text not null check (rol in ('user','assistant')),
  mensaje text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_ig_conv_sender on ig_conversaciones (sender_id, created_at);
```

## Variables de entorno necesarias (.env.local)

```
ANTHROPIC_API_KEY=            # console.anthropic.com (costo por uso)
IG_VERIFY_TOKEN=              # lo inventa el usuario, cualquier string
IG_PAGE_ACCESS_TOKEN=         # de Meta
IG_APP_SECRET=                # de Meta
LEADS_SHEET_ID=               # ID de la planilla de Google
```

## Mensajes de venta (borradores listos)

### "Dame más información"
```
¡Hola! 👋 Gracias por tu interés.

Desarrollamos un sistema de gestión completo para distribuidoras y comercios mayoristas. Con una sola herramienta manejás:

📦 Stock e inventario en tiempo real
🛒 Ventas y pedidos
👥 Clientes y cuenta corriente
🚚 Hoja de ruta y reparto
🧾 Facturación electrónica AFIP (A/B/C con CAE)
💰 Caja diaria, comisiones de vendedores
🌐 Tienda online propia para tus clientes

Todo desde el celular o la compu, sin instalar nada.

Para pasarte info y mostrarte cómo funciona, contame:
1️⃣ ¿Qué tipo de negocio tenés? (distribuidora, mayorista, kiosco...)
2️⃣ ¿Cuántos productos/clientes manejás aprox.?
3️⃣ ¿Qué es lo que más te complica hoy?
```

### Precio (cuando ya está interesado)
```
El sistema se cobra así 👇
✅ Un pago inicial único para dejarlo configurado a la medida de tu negocio
✅ Después, un abono mensual de $200.000 por sucursal

Por ese valor tenés TODO incluido: stock, ventas, pedidos, facturación AFIP,
cuenta corriente, tienda online y soporte. Sin instalar nada, actualizaciones siempre al día.

¿Querés ver el video de cómo funciona? 🙌
```

### Captar lead
```
Genial 🙌 Para coordinar una videollamada y mostrártelo con tu caso necesito:
👤 Nombre
🏢 Nombre del negocio
📱 WhatsApp
📍 Zona

Te contacto a la brevedad y lo vemos juntos.
```

## Próximo paso

Construir Fase 1. Bloqueado hasta que el usuario: corra el SQL, pase el link del video y el ID de la planilla, y consiga la `ANTHROPIC_API_KEY`.
