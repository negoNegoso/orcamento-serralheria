/** Dados do consumidor coletados em tempo de execução — nunca gravados no banco. */
export interface ConsumerData {
  name: string
  /** CPF ou CNPJ, mascarado (000.000.000-00 / 00.000.000/0000-00) */
  doc: string
  rg: string
  address: string
  phone: string
  email: string
}

/** Termos editáveis do contrato, pré-preenchidos a partir do orçamento. */
export interface ContractTerms {
  paymentTerms: string
  deadlineText: string
  siteAddress: string
  /** multa de rescisão em % sobre o valor do contrato */
  penaltyPercent: number
}
