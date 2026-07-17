import { createCompany } from '../actions'

export default function NovaEmpresaPage() {
  return (
    <form action={createCompany} className="max-w-md space-y-3">
      <h2 className="text-lg font-semibold">Nova empresa</h2>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Nome da empresa</span>
        <input name="name" required className="w-full rounded border px-3 py-2" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Cidade</span>
        <input name="city" className="w-full rounded border px-3 py-2" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Telefone</span>
        <input name="phone" className="w-full rounded border px-3 py-2" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Área de atuação</span>
        <input name="business_area" required placeholder="Ex.: Serralheria, Vidraçaria" className="w-full rounded border px-3 py-2" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Cor destaque</span>
        <input type="color" name="accent_color" defaultValue="#006688" className="h-10 w-20 cursor-pointer rounded border" />
      </label>
      <fieldset className="space-y-3 rounded border p-3">
        <legend className="px-1 text-sm font-medium">Primeiro admin da empresa</legend>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Nome</span>
          <input name="admin_name" required className="w-full rounded border px-3 py-2" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Email</span>
          <input name="admin_email" type="email" required className="w-full rounded border px-3 py-2" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Senha (mín. 8)</span>
          <input name="admin_password" type="password" required minLength={8} className="w-full rounded border px-3 py-2" />
        </label>
      </fieldset>
      <button className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground">Criar empresa</button>
    </form>
  )
}
