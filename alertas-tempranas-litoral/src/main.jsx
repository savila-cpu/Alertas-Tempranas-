import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LogOut, Users, LayoutDashboard, ShieldCheck } from 'lucide-react'
import { supabase } from './supabase'
import './styles.css'

function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) return setError('Correo o contraseña incorrectos.')
    onLogin(data.session)
  }

  return <div className="auth-shell">
    <form className="card login-card" onSubmit={submit}>
      <h1>Alertas Tempranas</h1>
      <p className="muted">Corporación de Educación Superior del Litoral</p>
      <label>Correo institucional</label>
      <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required />
      <label>Contraseña</label>
      <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required />
      {error && <p className="error">{error}</p>}
      <button disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</button>
    </form>
  </div>
}

function ForcePasswordChange({ user, onDone }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e){
    e.preventDefault(); setError('')
    if(password.length < 8) return setError('La contraseña debe tener mínimo 8 caracteres.')
    if(password !== confirm) return setError('Las contraseñas no coinciden.')
    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if(updateError){ setBusy(false); return setError(updateError.message) }
    const { error: profileError } = await supabase.from('profiles').update({ must_change_password:false }).eq('id', user.id)
    setBusy(false)
    if(profileError) return setError(profileError.message)
    onDone()
  }

  return <div className="auth-shell">
    <form className="card login-card" onSubmit={submit}>
      <ShieldCheck size={36}/>
      <h2>Crea tu contraseña</h2>
      <p className="muted">Por seguridad debes reemplazar la contraseña temporal antes de continuar.</p>
      <label>Nueva contraseña</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required />
      <label>Confirmar contraseña</label><input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} required />
      {error && <p className="error">{error}</p>}
      <button disabled={busy}>{busy ? 'Guardando…' : 'Guardar y continuar'}</button>
    </form>
  </div>
}

function AdminUsers(){
  const [email,setEmail]=useState('')
  const [name,setName]=useState('')
  const [role,setRole]=useState('viewer')
  const [tempPassword,setTempPassword]=useState('')
  const [msg,setMsg]=useState('')
  const [busy,setBusy]=useState(false)

  async function createUser(e){
    e.preventDefault(); setMsg(''); setBusy(true)
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
      body:JSON.stringify({ email, name, role, tempPassword })
    })
    const body = await response.json().catch(()=>({}))
    setBusy(false)
    if(!response.ok) return setMsg(body.error || 'No se pudo crear el usuario.')
    setMsg('Usuario creado. En su primer ingreso deberá cambiar la contraseña.')
    setEmail(''); setName(''); setTempPassword(''); setRole('viewer')
  }

  return <section className="card">
    <h2>Administración de usuarios</h2>
    <p className="muted">Crea usuarios con una contraseña temporal. El sistema obligará a cambiarla en el primer ingreso.</p>
    <form className="grid-form" onSubmit={createUser}>
      <div><label>Nombre</label><input value={name} onChange={e=>setName(e.target.value)} required /></div>
      <div><label>Correo</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></div>
      <div><label>Rol</label><select value={role} onChange={e=>setRole(e.target.value)}><option value="viewer">Consulta</option><option value="bienestar">Bienestar</option><option value="coordinator">Coordinación</option><option value="admin">Administrador</option></select></div>
      <div><label>Contraseña temporal</label><input type="text" value={tempPassword} onChange={e=>setTempPassword(e.target.value)} minLength={8} required /></div>
      <button disabled={busy}>{busy?'Creando…':'Crear usuario'}</button>
    </form>
    {msg && <p className="notice">{msg}</p>}
  </section>
}

function Dashboard({ profile }){
  const [tab,setTab]=useState('inicio')
  async function logout(){ await supabase.auth.signOut() }
  return <div className="app-shell">
    <aside>
      <div><h2>La Litoral</h2><p>Alertas Tempranas</p></div>
      <nav>
        <button className={tab==='inicio'?'active':''} onClick={()=>setTab('inicio')}><LayoutDashboard size={18}/>Inicio</button>
        {profile?.role==='admin' && <button className={tab==='usuarios'?'active':''} onClick={()=>setTab('usuarios')}><Users size={18}/>Usuarios</button>}
      </nav>
      <button className="logout" onClick={logout}><LogOut size={18}/>Cerrar sesión</button>
    </aside>
    <main>
      {tab==='inicio' && <>
        <h1>Panel de Alertas Tempranas</h1>
        <div className="stats">
          <div className="card stat"><span>Estudiantes</span><strong>—</strong></div>
          <div className="card stat"><span>En riesgo</span><strong>—</strong></div>
          <div className="card stat"><span>Programas</span><strong>—</strong></div>
        </div>
        <section className="card"><h2>Conexión de datos</h2><p className="muted">Aquí puedes integrar la hoja de Google Sheets o la fuente de datos que ya usabas en tu tablero.</p></section>
      </>}
      {tab==='usuarios' && profile?.role==='admin' && <AdminUsers/>}
    </main>
  </div>
}

function App(){
  const [session,setSession]=useState(null)
  const [profile,setProfile]=useState(null)
  const [loading,setLoading]=useState(true)

  async function loadProfile(user){
    const { data } = await supabase.from('profiles').select('*').eq('id',user.id).single()
    setProfile(data)
  }

  useEffect(()=>{
    supabase.auth.getSession().then(async ({data})=>{
      setSession(data.session)
      if(data.session?.user) await loadProfile(data.session.user)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next)=>{
      setSession(next)
      if(next?.user) await loadProfile(next.user); else setProfile(null)
    })
    return ()=>sub.subscription.unsubscribe()
  },[])

  if(loading) return <div className="center">Cargando…</div>
  if(!session) return <Login onLogin={setSession}/>
  if(profile?.must_change_password) return <ForcePasswordChange user={session.user} onDone={()=>loadProfile(session.user)} />
  return <Dashboard profile={profile}/>
}

createRoot(document.getElementById('root')).render(<App/>)
