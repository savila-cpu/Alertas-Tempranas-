import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const authHeader = req.headers.get('Authorization') || ''

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: authData, error: authError } = await userClient.auth.getUser()
    if (authError || !authData.user) return json({ error: 'No autenticado' }, 401)

    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: caller, error: callerError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .single()

    if (callerError || caller?.role !== 'admin') {
      return json({ error: 'Solo un administrador puede crear usuarios.' }, 403)
    }

    const { email, name, role = 'viewer', redirectTo } = await req.json()
    const allowedRoles = ['viewer', 'bienestar', 'coordinator', 'admin']

    if (!email || !name || !allowedRoles.includes(role)) {
      return json({ error: 'Nombre, correo y rol válido son obligatorios.' }, 400)
    }

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirectTo || undefined,
      data: { full_name: name, role },
    })

    if (error) return json({ error: error.message }, 400)
    if (!data.user) return json({ error: 'Supabase no devolvió el usuario invitado.' }, 500)

    const { error: profileError } = await admin.from('profiles').upsert({
      id: data.user.id,
      email,
      full_name: name,
      role,
      must_change_password: true,
    })

    if (profileError) return json({ error: profileError.message }, 400)

    return json({ ok: true, id: data.user.id, invited: true })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Error interno' }, 500)
  }
})
