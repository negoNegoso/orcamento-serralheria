const HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Em manutenção</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
         background:#0f172a; color:#e2e8f0; text-align:center; padding:24px; }
  .card { max-width:420px; }
  h1 { font-size:1.5rem; margin:0 0 12px; }
  p { margin:0; color:#94a3b8; line-height:1.5; }
</style>
</head>
<body>
  <div class="card">
    <h1>Site em manutenção</h1>
    <p>Estamos realizando ajustes no momento. Voltamos em breve.</p>
  </div>
</body>
</html>`

export function maintenanceResponse(): Response {
  return new Response(HTML, {
    status: 503,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'retry-after': '3600',
      'cache-control': 'no-store',
    },
  })
}
