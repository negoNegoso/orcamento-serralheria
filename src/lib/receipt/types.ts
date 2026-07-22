export interface Receipt {
  id: string
  quote_id: string
  amount: number
  receipt_date: string
  payer_doc: string
  payment_method: string
  receiver_name: string
  receiver_doc: string
  receiver_method: string
}
