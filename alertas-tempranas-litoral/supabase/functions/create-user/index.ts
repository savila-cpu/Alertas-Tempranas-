import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = req.headers.get('Authorization') || ''
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
    const { data: authData } = await userClient.auth.getUser()
    if (!authData.user) return json({ error: 'No autenticado' }, 401)

    const admin = createClient(supabaseUrl, serviceRole)
    const { data: caller } = await admin.from('profiles').select('role').eq('id', authData.user.id).single()
    if (caller?.role !== 'admin') return json({ error: 'No autorizado' }, 403)

    const { email, name, role='viewer', tempPassword } = await req.json()
    if (!email || !tempPassword || tempPassword.length < 8) return json({ error: 'Correo y contraseña temporal de mínimo 8 caracteres son obligatorios.' }, 400)

    const { data, error } = await admin.auth.admin.createUser({ email, password: tempPassword, email_confirm: true })
    if (error) return json({ error: error.message }, 400)

    const { error: profileError } = await admin.from('profiles').insert({ id:data.user.id, email, full_name:name || '', role, must_change_password:true })
    if (profileError) return json({ error: profileError.message }, 400)

    return json({ ok:true, id:data.user.id })
  } catch (e) {
    return json({ error: e.message || 'Error interno' }, 500)
  }
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
function json(body: unknown, status=200){
  return new Response(JSON.stringify(body), { status, headers:{ ...corsHeaders, 'Content-Type':'application/json' } })
}
