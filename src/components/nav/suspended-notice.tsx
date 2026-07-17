export function SuspendedNotice({ companyName }: { companyName: string | null }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="max-w-md space-y-3 text-center">
        <p className="text-4xl">⏸️</p>
        <h1 className="text-xl font-semibold">
          {companyName ? `${companyName} está suspensa` : 'Empresa suspensa'}
        </h1>
        <p className="text-muted-foreground">
          O acesso ao sistema está temporariamente suspenso. Entre em contato com o suporte da plataforma.
        </p>
      </div>
    </main>
  )
}
