'use client'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SubmitButton } from '@/components/ui/submit-button'
import { PhotoUpload } from '@/components/admin/photo-upload'
import { BusinessAreaInput } from '@/components/business-area-input'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function CompanyForm({ settings, action, areas }: { settings: any; action: (fd: FormData) => Promise<void>; areas: string[] }) {
  const [logo, setLogo] = useState<string | null>(settings?.logo_url ?? null)
  const [signature, setSignature] = useState<string | null>(settings?.signature_url ?? null)
  const companyId = settings?.id ?? ''
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-xl font-bold">Dados da empresa</h1>
      <input type="hidden" name="logo_url" value={logo ?? ''} />
      <input type="hidden" name="signature_url" value={signature ?? ''} />
      <div className="space-y-2"><Label>Logo</Label><PhotoUpload folder={`${companyId}/logo`} value={logo} onChange={setLogo} /></div>
      <div className="space-y-2"><Label htmlFor="name">Nome</Label>
        <Input id="name" name="name" defaultValue={settings?.name ?? ''} required /></div>
      <div className="space-y-2"><Label htmlFor="cnpj">CNPJ</Label>
        <Input id="cnpj" name="cnpj" defaultValue={settings?.cnpj ?? ''} placeholder="00.000.000/0000-00" /></div>
      <div className="space-y-2"><Label htmlFor="receiver_name">Nome do recebedor (recibo)</Label>
        <Input id="receiver_name" name="receiver_name" defaultValue={settings?.receiver_name ?? ''} placeholder="Nome de quem recebe o pagamento" /></div>
      <div className="space-y-2"><Label>Assinatura do recebedor (recibo)</Label><PhotoUpload folder={`${companyId}/assinatura`} value={signature} onChange={setSignature} /></div>
      <div className="space-y-2"><Label htmlFor="business_area">Área de atuação</Label>
        <BusinessAreaInput areas={areas} defaultValue={settings?.business_area ?? 'Serralheria'} required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm" />
        <span className="block text-xs text-muted-foreground">Aparece na barra lateral e no título das páginas.</span></div>
      <div className="space-y-2"><Label htmlFor="accent_color">Cor destaque</Label>
        <input id="accent_color" type="color" name="accent_color" defaultValue={settings?.accent_color ?? '#006688'}
          className="h-10 w-20 cursor-pointer rounded border" />
        <span className="block text-xs text-muted-foreground">Cor principal do sistema, do orçamento e do recibo desta empresa.</span></div>
      <div className="space-y-2"><Label htmlFor="city">Cidade</Label>
        <Input id="city" name="city" defaultValue={settings?.city ?? ''} /></div>
      <div className="space-y-2"><Label htmlFor="phone">Telefone/WhatsApp</Label>
        <Input id="phone" name="phone" defaultValue={settings?.phone ?? ''} /></div>
      <div className="space-y-2"><Label htmlFor="about_text">Texto de apresentação</Label>
        <Textarea id="about_text" name="about_text" rows={4} defaultValue={settings?.about_text ?? ''} /></div>
      <div className="space-y-2"><Label htmlFor="warranty_text">Garantias</Label>
        <Textarea id="warranty_text" name="warranty_text" rows={3} defaultValue={settings?.warranty_text ?? ''} /></div>
      <div className="space-y-2"><Label htmlFor="default_validity_days">Validade padrão do orçamento (dias)</Label>
        <Input id="default_validity_days" name="default_validity_days" type="number" min={1}
          defaultValue={settings?.default_validity_days ?? 15} /></div>
      <div className="space-y-2"><Label htmlFor="presentation_style">Estilo de apresentação do orçamento</Label>
        <select id="presentation_style" name="presentation_style" defaultValue={settings?.presentation_style ?? 'cards'}
          className="block rounded border bg-background p-2 text-sm">
          <option value="cards">Cards (padrão)</option>
          <option value="tabela">Tabela</option>
        </select>
        <span className="block text-xs text-muted-foreground">Como os itens aparecem na tela, no link público e no PDF.</span></div>
      <SubmitButton pendingLabel="Salvando…">Salvar</SubmitButton>
    </form>
  )
}
