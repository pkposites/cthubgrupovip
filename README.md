# LP — Grupo VIP Inauguração CT Hub Fitness

Página ponte (anúncio → página → grupo VIP do WhatsApp). HTML estático, sem build.

No ar: https://cthubfitnessvip.netlify.app (Netlify, publica sozinho a cada push
na branch `claude/funny-allen-fjq6z7`). Pixel: `1000596334599100` (Pixel Hub Fitness).

```
index.html               página (CSS e JS embutidos)
assets/logo-original.png logo oficial (fundo branco)
assets/logo.png          logo com fundo transparente e "FITNESS" claro (para fundo escuro)
assets/logo-240.png      versão usada na página
assets/favicon.png       ícone da aba
worker/                  Cloudflare Worker da API de Conversões (CAPI)
```

## Configuração

No topo do `index.html`, bloco `window.CONFIG`: `whatsappGroupUrl`, `metaPixelId`
e `capiEndpoint` (URL do worker).

## Eventos

Pixel e CAPI com o **mesmo event_id** (a Meta deduplica):

- `PageView` ao abrir (o envio ao servidor sai 1,2 s depois, quando o cookie `_fbp` existe)
- `Lead` no clique do botão (`value` 1, `currency` BRL, `content_name` "Grupo VIP Inauguração")
  e `lead_grupo_vip` no `dataLayer`. Uma vez por visita; redireciona ao grupo após 350 ms.

Dados enviados ao worker: `fbp`, `fbc` (cookie ou montado a partir do `fbclid`),
`external_id` (ID do visitante salvo no navegador) e a URL. O worker soma IP e
navegador e aplica hash SHA-256 no `external_id`.

## API de Conversões (Cloudflare Worker)

Pasta `worker/`, pixel `1000596334599100`. A LP já aponta para
`https://cthubcapi.robson-oc96.workers.dev`; enquanto o worker não existir, o envio
falha em silêncio e a página segue normal.

1. Cloudflare > Workers e Pages > Create > Import a repository >
   `pkposites/cthubgrupovip`, branch `claude/funny-allen-fjq6z7`,
   **Root directory** `worker`, nome **cthubcapi** (o nome define a URL).
2. Settings > Variables and Secrets: secret `META_ACCESS_TOKEN`
   (Gerenciador de Eventos > Pixel Hub Fitness > Configurações > API de Conversões >
   Gerar token de acesso). `PIXEL_ID` e `ALLOWED_ORIGIN` já vêm do `wrangler.toml`.
3. Se o domínio da LP mudar, ajustar `ALLOWED_ORIGIN` no `wrangler.toml`.
4. Teste: copiar o código de Gerenciador de Eventos > Testar eventos para o secret
   `TEST_EVENT_CODE`, abrir a LP e clicar no botão. `PageView` e `Lead` devem aparecer
   como "Navegador" e "Servidor" (deduplicados). Depois, apagar o `TEST_EVENT_CODE`.
   `GET /health` responde `ok`.
