# LP — Grupo VIP Inauguração CT Hub Fitness

Página ponte (anúncio → página → grupo VIP do WhatsApp). HTML estático, sem build.

No ar: https://cthubfitnessvip.netlify.app (Netlify, publica sozinho a cada push
na branch `claude/funny-allen-fjq6z7`). Pixel: `1000596334599100` (Pixel Hub Fitness).

```
index.html        página (CSS e JS embutidos)
assets/logo.svg   logo redesenhado em SVG (trocar pelo arquivo oficial quando houver)
```

## Antes de publicar

No topo do `index.html`, bloco `window.CONFIG`:

- `whatsappGroupUrl` — link de convite do grupo (`https://chat.whatsapp.com/...`)
- `metaPixelId` — ID do pixel da Meta

## Eventos

- Ao abrir: `PageView` (pixel)
- No clique do botão "Quero entrar no Grupo VIP": `Lead` (pixel, com `eventID`)
  e `lead_grupo_vip` no `dataLayer` (GTM/GA4, se instalados). Dispara uma vez por
  visita e redireciona para o grupo após 350 ms.
