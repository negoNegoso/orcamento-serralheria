'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { maskCpfCnpj } from '@/lib/receipt/mask'
import { isValidCpfCnpj, isValidEmail } from '@/lib/contract/validate'
import type { ConsumerData, ContractTerms } from '@/lib/contract/types'

export interface ContractFormErrors {
  name?: string; doc?: string; address?: string; email?: string
  paymentTerms?: string; deadlineText?: string
}

/** Valida o formulário; retorna mapa de erros vazio quando tudo ok. */
export function validateContractForm(consumer: ConsumerData, terms: ContractTerms): ContractFormErrors {
  const errors: ContractFormErrors = {}
  if (!consumer.name.trim()) errors.name = 'Informe o nome completo.'
  if (!isValidCpfCnpj(consumer.doc)) errors.doc = 'CPF/CNPJ inválido.'
  if (!consumer.address.trim()) errors.address = 'Informe o endereço completo.'
  if (consumer.email.trim() && !isValidEmail(consumer.email)) errors.email = 'E-mail inválido.'
  if (!terms.paymentTerms.trim()) errors.paymentTerms = 'Informe as condições de pagamento.'
  if (!terms.deadlineText.trim()) errors.deadlineText = 'Informe o prazo de execução.'
  return errors
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

export function ContractForm({ consumer, terms, companyCnpjMissing, errors, onChange, onChangeTerms, onSubmit }: {
  consumer: ConsumerData
  terms: ContractTerms
  companyCnpjMissing: boolean
  errors: ContractFormErrors
  onChange: (c: ConsumerData) => void
  onChangeTerms: (t: ContractTerms) => void
  onSubmit: () => void
}) {
  const set = (patch: Partial<ConsumerData>) => onChange({ ...consumer, ...patch })
  const setTerms = (patch: Partial<ContractTerms>) => onChangeTerms({ ...terms, ...patch })
  const valid = Object.keys(validateContractForm(consumer, terms)).length === 0

  return (
    <form className="space-y-6" onSubmit={e => { e.preventDefault(); onSubmit() }}>
      {companyCnpjMissing && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          A empresa não tem CNPJ cadastrado — o contrato sairá sem ele.
          Cadastre em Admin → Empresa para um contrato completo.
        </p>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">Dados do contratante (consumidor)</h2>
        <p className="text-sm text-muted-foreground">
          Estes dados são usados apenas para gerar o contrato e não ficam salvos no sistema.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome completo *" error={errors.name}>
            <Input value={consumer.name} onChange={e => set({ name: e.target.value })} />
          </Field>
          <Field label="CPF ou CNPJ *" error={errors.doc}>
            <Input value={consumer.doc} inputMode="numeric"
              onChange={e => set({ doc: maskCpfCnpj(e.target.value) })} />
          </Field>
          <Field label="RG (opcional)">
            <Input value={consumer.rg} onChange={e => set({ rg: e.target.value })} />
          </Field>
          <Field label="Telefone (opcional)">
            <Input value={consumer.phone} onChange={e => set({ phone: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Endereço completo *" error={errors.address}>
              <Input value={consumer.address} placeholder="Rua, número, bairro, cidade/UF, CEP"
                onChange={e => set({ address: e.target.value })} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="E-mail (opcional)" error={errors.email}>
              <Input type="email" value={consumer.email} onChange={e => set({ email: e.target.value })} />
            </Field>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Termos do contrato</h2>
        <Field label="Condições de pagamento *" error={errors.paymentTerms}>
          <Textarea rows={3} value={terms.paymentTerms}
            placeholder="Ex.: Entrada de R$ 2.000,00 via PIX na assinatura; saldo em 2 parcelas de R$ 1.500,00."
            onChange={e => setTerms({ paymentTerms: e.target.value })} />
        </Field>
        <Field label="Prazo de execução *" error={errors.deadlineText}>
          <Textarea rows={2} value={terms.deadlineText}
            onChange={e => setTerms({ deadlineText: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Local de execução (obra)">
            <Input value={terms.siteAddress} onChange={e => setTerms({ siteAddress: e.target.value })} />
          </Field>
          <Field label="Multa de rescisão (%)">
            <Input type="number" min={0} max={100} value={terms.penaltyPercent}
              onChange={e => setTerms({ penaltyPercent: Number(e.target.value) || 0 })} />
          </Field>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!valid}>Gerar contrato</Button>
        {!valid && <span className="text-sm text-muted-foreground">Preencha os campos obrigatórios.</span>}
      </div>
      <p className="text-xs text-muted-foreground">
        Modelo padrão de contrato. Para casos específicos, revise o texto com um advogado.
      </p>
    </form>
  )
}
