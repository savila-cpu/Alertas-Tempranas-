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

type TeacherInput = {
  name?: string
  email?: string
  teacherName?: string
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
      return json({ error: 'Solo un administrador puede crear usuarios docentes.' }, 403)
    }

    const body = await req.json()
    const redirectTo = body?.redirectTo || undefined
    const users: TeacherInput[] = Array.isArray(body?.users) ? body.users : []

    if (!users.length) return json({ error: 'No se recibieron docentes para crear.' }, 400)
    if (users.length > 100) return json({ error: 'El cargue permite máximo 100 docentes por lote.' }, 400)

    const seen = new Set<string>()
    const results: Array<Record<string, unknown>> = []

    for (const item of users) {
      const name = String(item?.name || '').trim()
      const email = String(item?.email || '').trim().toLowerCase()
      const teacherName = String(item?.teacherName || name).trim()

      if (!name || !email || !teacherName) {
        results.push({ email, ok: false, error: 'Nombre, correo y docente vinculado son obligatorios.' })
        continue
      }
      if (!email.includes('@')) {
        results.push({ email, ok: false, error: 'Correo inválido.' })
        continue
      }
      if (seen.has(email)) {
        results.push({ email, ok: false, error: 'Correo duplicado dentro del archivo.' })
        continue
      }
      seen.add(email)

      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { full_name: name, role: 'docente', teacher_name: teacherName },
      })

      if (error || !data.user) {
        results.push({ email, ok: false, error: error?.message || 'Supabase no devolvió el usuario invitado.' })
        continue
      }

      const { error: profileError } = await admin.from('profiles').upsert({
        id: data.user.id,
        email,
        full_name: name,
        role: 'docente',
        teacher_name: teacherName,
        must_change_password: true,
      })

      if (profileError) {
        results.push({ email, ok: false, error: profileError.message })
        continue
      }

      results.push({ email, ok: true, id: data.user.id, teacherName })
    }

    const created = results.filter(x => x.ok).length
    return json({ ok: true, created, failed: results.length - created, results })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Error interno' }, 500)
  }
})
