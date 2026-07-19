'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ContractForm, validateContractForm, type ContractFormErrors } from '@/components/contract/contract-form'
import { ContractDocument } from '@/components/contract/contract-document'
import type { ConsumerData, ContractTerms } from '@/lib/contract/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

export function ContractFlow({ company, quote, items }: { company: any; quote: any; items: any[] }) {
  const [step, setStep] = useState<'form' | 'preview'>('form')
  const [errors, setErrors] = useState<ContractFormErrors>({})
  // Dados do consumidor: só memória — nunca enviados a servidor nem gravados.
  const [consumer, setConsumer] = useState<ConsumerData>({
    name: quote.customer_name ?? '', doc: '', rg: '', address: '',
    phone: quote.customer_phone ?? '', email: '',
  })
  const [terms, setTerms] = useState<ContractTerms>({
    paymentTerms: '',
    deadlineText: quote.delivery_date
      ? `Os serviços serão concluídos até ${new Date(quote.delivery_date + 'T12:00:00').toLocaleDateString('pt-BR')}.`
      : 'Os serviços serão concluídos em até 30 (trinta) dias úteis a contar da confirmação do pagamento inicial.',
    siteAddress: quote.site_address ?? '',
    penaltyPercent: 10,
  })

  if (step === 'form') {
    return (
      <ContractForm consumer={consumer} terms={terms} errors={errors}
        companyCnpjMissing={!company?.cnpj}
        onChange={c => { setConsumer(c); setErrors(validateContractForm(c)) }}
        onChangeTerms={setTerms}
        onSubmit={() => {
          const errs = validateContractForm(consumer)
          setErrors(errs)
          if (Object.keys(errs).length === 0) setStep('preview')
        }} />
    )
  }

  return (
    <div className="space-y-4">
      <div className="no-print flex gap-2">
        <Button variant="outline" onClick={() => setStep('form')}>← Editar dados</Button>
        <Button className="ml-auto" onClick={() => window.print()}>Baixar PDF</Button>
      </div>
      <ContractDocument company={company} quote={quote} items={items} consumer={consumer} terms={terms} />
    </div>
  )
}
