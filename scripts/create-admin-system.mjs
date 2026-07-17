import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const [email, password, ...nameParts] = process.argv.slice(2)
const name = nameParts.join(' ')
if (!email || !password || !name) {
  console.error('Uso: node scripts/create-admin-system.mjs <email> <senha> <nome>')
  process.exit(1)
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true })
if (error) { console.error(error.message); process.exit(1) }
const { error: pErr } = await supabase.from('profiles')
  .insert({ id: data.user.id, email, name, role: 'admin_system', company_id: null })
if (pErr) { console.error(pErr.message); process.exit(1) }
console.log('admin_system criado:', email)
