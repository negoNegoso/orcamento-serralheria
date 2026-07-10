'use client'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SubmitButton } from '@/components/ui/submit-button'
import { PhotoUpload } from '@/components/admin/photo-upload'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function CompanyForm({ settings, action }: { settings: any; action: (fd: FormData) => Promise<void> }) {
  const [logo, setLogo] = useState<string | null>(settings?.logo_url ?? null)
  const [signature, setSignature] = useState<string | null>(settings?.signature_url ?? null)
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-xl font-bold">Dados da empresa</h1>
      <input type="hidden" name="logo_url" value={logo ?? ''} />
      <input type="hidden" name="signature_url" value={signature ?? ''} />
      <div className="space-y-2"><Label>Logo</Label><PhotoUpload folder="logo" value={logo} onChange={setLogo} /></div>
      <div className="space-y-2"><Label htmlFor="name">Nome</Label>
        <Input id="name" name="name" defaultValue={settings?.name ?? ''} required /></div>
      <div className="space-y-2"><Label htmlFor="cnpj">CNPJ</Label>
        <Input id="cnpj" name="cnpj" defaultValue={settings?.cnpj ?? ''} placeholder="00.000.000/0000-00" /></div>
      <div className="space-y-2"><Label htmlFor="receiver_name">Nome do recebedor (recibo)</Label>
        <Input id="receiver_name" name="receiver_name" defaultValue={settings?.receiver_name ?? ''} placeholder="Nome de quem recebe o pagamento" /></div>
      <div className="space-y-2"><Label>Assinatura do recebedor (recibo)</Label><PhotoUpload folder="assinatura" value={signature} onChange={setSignature} /></div>
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
      <SubmitButton pendingLabel="Salvando…">Salvar</SubmitButton>
    </form>
  )
}
