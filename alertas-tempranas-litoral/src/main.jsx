import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  LogOut, Users, LayoutDashboard, ShieldCheck, GraduationCap,
  BookOpen, HeartHandshake, Database, RefreshCw, FilterX,
  AlertTriangle, FileDown, Search, UserRound, ChevronDown
} from 'lucide-react'
import { supabase } from './supabase'
import './styles.css'

const SHEET_ID = '1mMGppki5Eh3aYcOOKYPoyvSKA119hMlW'
const SHEET_GID = '260302609'
const SHEET_NAME = 'Notas'
const SHEET_CSV_URLS = [
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Notas`,
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`,
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`
]

const normalize = (value='') => String(value)
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')

function parseCSV(text){
  const rows=[]; let row=[]; let cell=''; let quoted=false
  for(let i=0;i<text.length;i++){
    const c=text[i], n=text[i+1]
    if(c==='"' && quoted && n==='"'){ cell+='"'; i++; continue }
    if(c==='"'){ quoted=!quoted; continue }
    if(c===',' && !quoted){ row.push(cell); cell=''; continue }
    if((c==='\n' || c==='\r') && !quoted){
      if(c==='\r' && n==='\n') i++
      row.push(cell); cell=''
      if(row.some(v=>String(v).trim()!=='')) rows.push(row)
      row=[]
      continue
    }
    cell+=c
  }
  if(cell || row.length){ row.push(cell); rows.push(row) }
  if(rows.length<2) return []
  const headers=rows[0].map((h,i)=> normalize(h) || `col_${i}`)
  return rows.slice(1).map(r=>{
    const o={}
    headers.forEach((h,i)=>o[h]=(r[i]??'').trim())
    return o
  })
}

function pick(obj, aliases){
  for(const a of aliases){
    const k=normalize(a)
    if(obj?.[k]!==undefined && obj[k]!=='') return obj[k]
  }
  return ''
}

function pickFuzzy(obj, aliases, tokenGroups=[]){
  const exact=pick(obj,aliases)
  if(exact!=='') return exact
  const entries=Object.entries(obj||{})
  for(const tokens of tokenGroups){
    const found=entries.find(([k,v])=>{
      if(v===undefined || v===null || String(v).trim()==='') return false
      const nk=normalize(k)
      return tokens.every(t=>nk.includes(normalize(t)))
    })
    if(found) return found[1]
  }
  return ''
}

function hasFuzzyField(obj, aliases, tokenGroups=[]){
  const keys=Object.keys(obj||{}).map(normalize)
  if(aliases.some(a=>keys.includes(normalize(a)))) return true
  return tokenGroups.some(tokens=>keys.some(k=>tokens.every(t=>k.includes(normalize(t)))))
}

function num(v){
  if(v===null || v===undefined || v==='') return 0
  const raw=String(v).replace(/%/g,'').replace(/\./g, m=>m).replace(',','.')
  const n=parseFloat(raw)
  return Number.isFinite(n)?n:0
}

function pct(v){
  const n=num(v)
  if(String(v).includes('%')) return n
  return n<=1 ? n*100 : n
}

function normalizeRecord(row){
  const estudiante=pickFuzzy(row,
    ['Nombre_completo','estudiante','nombre_estudiante','nombre','estudiante_nombre','nombre_completo','nombre_estudiante_completo','estudiante_completo'],
    [['nombre','estudiante'],['estudiante']]
  )
  const documento=pickFuzzy(row,
    ['Numero_identificacion','documento','identificacion','cedula','numero_documento'],
    [['documento'],['identificacion'],['cedula']]
  )
  const programa=pickFuzzy(row,
    ['Nombre_programa','nombre_programa','programa','programa_academico'],
    [['nombre','programa'],['programa']]
  )
  const snies=pickFuzzy(row,['snies','codigo_snies'],[['snies']])
  const docente=pickFuzzy(row,['docente','nombre_docente','profesor'],[['nombre','docente'],['docente'],['profesor']])
  const asignatura=pickFuzzy(row,['Nombre_asignatura','asignatura','materia','curso'],[['nombre','asignatura'],['asignatura'],['materia']])
  const modalidad=pickFuzzy(row,['modalidad'],[['modalidad']])
  const bloque=pickFuzzy(row,['bloque'],[['bloque']])
  const periodo='2026-2'

  const porcentajeRaw=pickFuzzy(row,
    ['Porcentaje_evaluado','porcentaje_evaluado','porcentaje_evaluacion','evaluado','porcentaje'],
    [['porcentaje','evalu'],['porcentaje']]
  )
  const promedioRaw=pickFuzzy(row,
    ['Promedio_evaluacion','promedio_evaluacion','promedio','nota','nota_actual','acumulado'],
    [['promedio','evalu'],['promedio'],['nota','actual'],['acumulado']]
  )
  const perdidoRaw=String(pickFuzzy(row,
    ['Perdió','perdio','perdido','en_riesgo','riesgo'],
    [['perdio'],['perdido'],['riesgo']]
  )).toLowerCase()

  const porcentaje=pct(porcentajeRaw)
  const promedio=num(promedioRaw)
  const tieneCampoPorcentaje=hasFuzzyField(row,
    ['porcentaje_evaluado','porcentaje_evaluacion','evaluado','porcentaje'],
    [['porcentaje','evalu'],['porcentaje']]
  )
  const tieneCampoPromedio=hasFuzzyField(row,
    ['promedio_evaluacion','promedio','nota','nota_actual','acumulado'],
    [['promedio','evalu'],['promedio'],['nota','actual'],['acumulado']]
  )

  const corte=pickFuzzy(row,['Corte','corte'],[['corte']])
  const estadoBienestar=pickFuzzy(row,['estado_bienestar','estado_seguimiento','estado'],[['estado','bienestar'],['estado','seguimiento']])
  const observaciones=pickFuzzy(row,['observaciones','observacion','seguimiento'],[['observacion'],['seguimiento']])
  const asesor=pickFuzzy(row,['asesor','asesor_asignado'],[['asesor']])

  const virtual=normalize(modalidad).includes('virtual')
  const bloque1=String(bloque).trim()==='1'
  const bloque2=String(bloque).trim()==='2'
  const corteNum=Number(corte||0)

  // Solo se excluye un registro del bloque activo cuando realmente existen
  // campos de evaluación y ambos están en cero. Si las columnas no fueron
  // reconocidas, el registro permanece visible para evitar vaciar el tablero.
  const sinReporte=virtual && bloque2 &&
    tieneCampoPorcentaje && tieneCampoPromedio &&
    porcentaje===0 && promedio===0

  let enRiesgo=false
  if(['1','si','sí','true','perdio','perdido','riesgo'].includes(perdidoRaw)) enRiesgo=true
  else if(!sinReporte){
    if(virtual && bloque1 && corteNum===1 && porcentaje>0) enRiesgo=promedio>0 && promedio<0.9
    else if(virtual && bloque1 && corteNum===2 && porcentaje>0) enRiesgo=promedio>0 && promedio<1.2
    else if(virtual && porcentaje>=100) enRiesgo=promedio>0 && promedio<3
    else if(!virtual && porcentaje>0 && porcentaje<=35) enRiesgo=promedio>0 && promedio<0.9
    else if(promedio>0 && porcentaje>=80) enRiesgo=promedio<3
  }

  return {
    ...row, estudiante, documento, programa, snies, docente, asignatura,
    modalidad, bloque, corte, periodo, porcentaje, promedio, enRiesgo,
    sinReporte, estadoBienestar, observaciones, asesor,
    _porcentajeRaw:porcentajeRaw, _promedioRaw:promedioRaw
  }
}

function Login({ onLogin }) {
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  async function submit(e){
    e.preventDefault(); setBusy(true); setError('')
    const {data,error}=await supabase.auth.signInWithPassword({email,password})
    setBusy(false)
    if(error) return setError('Correo o contraseña incorrectos.')
    onLogin(data.session)
  }
  return <div className="auth-shell">
    <form className="card login-card" onSubmit={submit}>
      <div className="brand-badge">L</div>
      <h1>Alertas Tempranas</h1>
      <p className="muted">Corporación de Educación Superior del Litoral</p>
      <label>Correo institucional</label>
      <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/>
      <label>Contraseña</label>
      <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/>
      {error&&<p className="error">{error}</p>}
      <button className="primary" disabled={busy}>{busy?'Ingresando…':'Ingresar'}</button>
    </form>
  </div>
}

function ForcePasswordChange({user,onDone}){
  const [password,setPassword]=useState('')
  const [confirm,setConfirm]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  async function submit(e){
    e.preventDefault(); setError('')
    if(password.length<8) return setError('La contraseña debe tener mínimo 8 caracteres.')
    if(password!==confirm) return setError('Las contraseñas no coinciden.')
    setBusy(true)
    const {error:updateError}=await supabase.auth.updateUser({password})
    if(updateError){setBusy(false);return setError(updateError.message)}
    const {error:profileError}=await supabase.from('profiles').update({must_change_password:false}).eq('id',user.id)
    setBusy(false)
    if(profileError) return setError(profileError.message)
    onDone()
  }
  return <div className="auth-shell"><form className="card login-card" onSubmit={submit}>
    <ShieldCheck size={38}/><h2>Crea tu contraseña</h2>
    <p className="muted">Debes reemplazar la contraseña temporal antes de continuar.</p>
    <label>Nueva contraseña</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/>
    <label>Confirmar contraseña</label><input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} required/>
    {error&&<p className="error">{error}</p>}
    <button className="primary" disabled={busy}>{busy?'Guardando…':'Guardar y continuar'}</button>
  </form></div>
}

function AdminUsers(){
  const [email,setEmail]=useState(''),[name,setName]=useState(''),[role,setRole]=useState('viewer')
  const [msg,setMsg]=useState(''),[busy,setBusy]=useState(false),[users,setUsers]=useState([]),[loading,setLoading]=useState(true),[actionBusy,setActionBusy]=useState('')

  async function callAdmin(body){
    const {data,error}=await supabase.functions.invoke('create-user',{body})
    if(error) throw new Error(error.message||'No se pudo completar la operación.')
    if(data?.error) throw new Error(data.error)
    return data
  }
  async function loadUsers(){
    setLoading(true)
    try{const data=await callAdmin({action:'list'});setUsers(data?.users||[])}
    catch(err){setMsg(String(err?.message||err))}
    finally{setLoading(false)}
  }
  useEffect(()=>{loadUsers()},[])

  async function createUser(e){
    e.preventDefault();setMsg('');setBusy(true)
    try{
      await callAdmin({action:'create',email,name,role,redirectTo:window.location.origin})
      setMsg('Invitación enviada por correo. El usuario deberá crear su contraseña al ingresar.')
      setEmail('');setName('');setRole('viewer');await loadUsers()
    }catch(err){setMsg(String(err?.message||err))}
    finally{setBusy(false)}
  }
  async function changeRole(userId,nextRole){
    setActionBusy(userId+'role');setMsg('')
    try{await callAdmin({action:'update_role',userId,role:nextRole});setUsers(x=>x.map(u=>u.id===userId?{...u,role:nextRole}:u));setMsg('Rol actualizado correctamente.')}
    catch(err){setMsg(String(err?.message||err))}
    finally{setActionBusy('')}
  }
  async function toggleAccess(u){
    setActionBusy(u.id+'access');setMsg('')
    try{await callAdmin({action:'set_access',userId:u.id,disabled:!u.disabled});setUsers(x=>x.map(v=>v.id===u.id?{...v,disabled:!v.disabled}:v));setMsg(u.disabled?'Acceso reactivado correctamente.':'Acceso desactivado correctamente.')}
    catch(err){setMsg(String(err?.message||err))}
    finally{setActionBusy('')}
  }
  async function resetAccess(u){
    setActionBusy(u.id+'reset');setMsg('')
    try{await callAdmin({action:'reset_access',email:u.email,redirectTo:window.location.origin});setMsg('Se envió el correo para restablecer el acceso a '+u.email+'.')}
    catch(err){setMsg(String(err?.message||err))}
    finally{setActionBusy('')}
  }
  function status(u){if(u.disabled)return 'Desactivado';if(u.must_change_password)return 'Pendiente de activación';if(u.last_sign_in_at)return 'Activo';return 'Invitado'}

  return <div style={{display:'grid',gap:18}}>
    <section className="card page-card">
      <div className="section-head"><div><h2>Administración de usuarios</h2><p className="muted">Crea usuarios y envía una invitación por correo para que definan su contraseña.</p></div><ShieldCheck/></div>
      <form className="grid-form" onSubmit={createUser}>
        <div><label>Nombre</label><input value={name} onChange={e=>setName(e.target.value)} required/></div>
        <div><label>Correo</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></div>
        <div><label>Rol</label><select value={role} onChange={e=>setRole(e.target.value)}><option value="viewer">Consulta</option><option value="bienestar">Bienestar</option><option value="coordinator">Coordinación</option><option value="admin">Administrador</option></select></div>
        <div className="invite-note"><label>Acceso</label><p className="muted">El usuario recibirá un correo de invitación y creará su propia contraseña.</p></div>
        <button className="primary" disabled={busy}>{busy?'Enviando…':'Crear usuario y enviar invitación'}</button>
      </form>
      {msg&&<p className="notice">{msg}</p>}
    </section>
    <section className="card page-card">
      <div className="section-head"><div><h2>Usuarios registrados</h2><p className="muted">Administra roles y accesos sin entrar a Supabase.</p></div><button className="secondary" onClick={loadUsers} disabled={loading}>{loading?'Actualizando…':'Actualizar'}</button></div>
      <div style={{overflowX:'auto'}}>
        <table className="data-table"><thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Último ingreso</th><th>Acciones</th></tr></thead>
        <tbody>{users.map(u=><tr key={u.id}>
          <td><strong>{u.full_name||'Sin nombre'}</strong><div className="muted">{u.email}</div></td>
          <td><select value={u.role} disabled={actionBusy===u.id+'role'} onChange={e=>changeRole(u.id,e.target.value)}><option value="viewer">Consulta</option><option value="bienestar">Bienestar</option><option value="coordinator">Coordinación</option><option value="admin">Administrador</option></select></td>
          <td>{status(u)}</td>
          <td>{u.last_sign_in_at?new Date(u.last_sign_in_at).toLocaleString('es-CO'):'—'}</td>
          <td><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button className="secondary" disabled={actionBusy===u.id+'reset'} onClick={()=>resetAccess(u)}>Restablecer acceso</button><button className="secondary" disabled={actionBusy===u.id+'access'} onClick={()=>toggleAccess(u)}>{u.disabled?'Reactivar':'Desactivar'}</button></div></td>
        </tr>)}{!loading&&users.length===0&&<tr><td colSpan="5" className="muted">No hay usuarios registrados.</td></tr>}</tbody></table>
      </div>
    </section>
  </div>
}

function FilterBar({data,filters,setFilters}){
  const uniq=k=>[...new Set(data.map(x=>x[k]).filter(Boolean))].sort((a,b)=>a.localeCompare(b))
  const field=(k,label,items)=> <label className="filter-field">{label}<div className="select-wrap"><select value={filters[k]} onChange={e=>setFilters({...filters,[k]:e.target.value})}><option value="">Todos</option>{items.map(v=><option key={v}>{v}</option>)}</select><ChevronDown size={15}/></div></label>
  return <div className="filters card">
    <div className="filter-title"><Search size={17}/><b>Filtros</b></div>
    {field('periodo','Periodo',uniq('periodo').filter(x=>['2026-1','2026-2'].includes(x)||!/^2025/.test(x)))}
    {field('programa','Programa',uniq('programa'))}
    {field('modalidad','Modalidad',uniq('modalidad'))}
    {field('bloque','Bloque',uniq('bloque'))}
    {field('corte','Corte',uniq('corte'))}
    {field('docente','Docente',uniq('docente'))}
    <button className="ghost" onClick={()=>setFilters({periodo:'',programa:'',modalidad:'',bloque:'',corte:'',docente:''})}><FilterX size={16}/>Limpiar</button>
  </div>
}

const groupRows=(data,key)=>Object.values(data.reduce((acc,r)=>{
  const name=r[key]||'Sin información'
  acc[name]??={name,total:0,risk:0,students:new Set()}
  acc[name].total++; if(r.enRiesgo) acc[name].risk++
  acc[name].students.add(r.documento||r.estudiante||Math.random())
  return acc
},{})).map(x=>({...x,students:x.students.size,pct:x.total?Math.round(x.risk/x.total*100):0})).sort((a,b)=>b.pct-a.pct)

function SimpleTable({columns,rows,empty='No hay información para mostrar.'}){
  return <div className="table-wrap"><table><thead><tr>{columns.map(c=><th key={c.key}>{c.label}</th>)}</tr></thead><tbody>
    {rows.length===0?<tr><td colSpan={columns.length} className="empty">{empty}</td></tr>:rows.map((r,i)=><tr key={i}>{columns.map(c=><td key={c.key}>{c.render?c.render(r):r[c.key]}</td>)}</tr>)}
  </tbody></table></div>
}

function Dashboard({profile}){
  const [tab,setTab]=useState('inicio')
  const [data,setData]=useState([])
  const [loading,setLoading]=useState(true)
  const [dataError,setDataError]=useState('')
  const [updated,setUpdated]=useState(null)
  const [filters,setFilters]=useState({periodo:'',programa:'',modalidad:'',bloque:'',corte:'',docente:''})

  async function loadData(){
    setLoading(true);setDataError('')
    try{
      let parsed=[]; let lastError=''
      for(const url of SHEET_CSV_URLS){
        try{
          const res=await fetch(url,{cache:'no-store'})
          if(!res.ok) throw new Error(`HTTP ${res.status}`)
          const text=await res.text()
          if(text.trim().startsWith('<!DOCTYPE')||text.includes('<html')) throw new Error('respuesta HTML')
          const candidate=parseCSV(text).map(normalizeRecord)
          if(candidate.length){ parsed=candidate; break }
          lastError='La hoja respondió, pero no devolvió filas de datos.'
        }catch(e){ lastError=e.message }
      }
      if(!parsed.length) throw new Error(lastError||'No fue posible leer Google Sheets.')
      setData(parsed);setUpdated(new Date())
    }catch(err){
      setData([])
      setDataError(`No se pudieron cargar los datos: ${err.message}`)
    }finally{setLoading(false)}
  }
  useEffect(()=>{loadData()},[])
  async function logout(){await supabase.auth.signOut()}

  const filtered=useMemo(()=>data.filter(r=>Object.entries(filters).every(([k,v])=>!v||String(r[k])===v)),[data,filters])
  const reportable=filtered.filter(r=>!r.sinReporte)
  const uniqueStudents=new Set(reportable.map(r=>r.documento||r.estudiante).filter(Boolean))
  const riskStudents=new Set(reportable.filter(r=>r.enRiesgo).map(r=>r.documento||r.estudiante).filter(Boolean))
  const programs=new Set(reportable.map(r=>r.programa).filter(Boolean))
  const programRows=groupRows(reportable,'programa')
  const teacherRows=groupRows(reportable,'docente')
  const subjectRows=groupRows(reportable,'asignatura')
  const riskRows=reportable.filter(r=>r.enRiesgo)

  const bienestarRows=Object.values(riskRows.reduce((acc,r)=>{
    const key=r.documento||r.estudiante||`${r.programa}-${r.asignatura}`
    if(!acc[key]) acc[key]={...r,subjects:new Set(),teachers:new Set()}
    if(r.asignatura) acc[key].subjects.add(r.asignatura)
    if(r.docente) acc[key].teachers.add(r.docente)
    return acc
  },{})).map(r=>({...r,asignaturas:[...r.subjects].join(', '),docentes:[...r.teachers].join(', ')}))

  function downloadBienestar(){
    const headers=['Estudiante','Documento','Programa','Modalidad','Asignaturas','Estado bienestar','Observaciones']
    const lines=[headers,...bienestarRows.map(r=>[r.estudiante,r.documento,r.programa,r.modalidad,r.asignaturas,r.estadoBienestar,r.observaciones])]
    const csv=lines.map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'})
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='seguimiento-bienestar.csv';a.click();URL.revokeObjectURL(a.href)
  }

  const menu=[
    ['inicio','Inicio',LayoutDashboard],
    ['programas','Programas',GraduationCap],
    ['docentes','Docentes',UserRound],
    ['asignaturas','Asignaturas',BookOpen],
    ['bienestar','Bienestar',HeartHandshake],
    ['fuente','Fuente de datos',Database]
  ]
  if(profile?.role==='admin') menu.push(['usuarios','Usuarios',Users])

  return <div className="app-shell">
    <aside>
      <div className="brand"><div className="brand-mark">L</div><div><h2>La Litoral</h2><p>Alertas Tempranas</p></div></div>
      <nav>{menu.map(([id,label,Icon])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}><Icon size={18}/>{label}</button>)}</nav>
      <div className="aside-user"><span>{profile?.full_name||profile?.email||'Usuario'}</span><small>{profile?.role||'consulta'}</small></div>
      <button className="logout" onClick={logout}><LogOut size={18}/>Cerrar sesión</button>
    </aside>

    <main>
      {tab!=='usuarios'&&<FilterBar data={data} filters={filters} setFilters={setFilters}/>}
      {loading&&<div className="banner info">Actualizando información desde Google Sheets…</div>}
      {dataError&&<div className="banner danger"><AlertTriangle size={18}/><span>{dataError} Verifica que la hoja permita acceso mediante enlace.</span><button onClick={loadData}>Reintentar</button></div>}

      {tab==='inicio'&&<>
        <div className="page-title"><div><h1>Panel de Alertas Tempranas</h1><p>Seguimiento académico · Periodo {filters.periodo||'Todos'}</p></div><button className="refresh" onClick={loadData}><RefreshCw size={17}/>Actualizar</button></div>
        <div className="stats">
          <div className="card stat"><span>Estudiantes</span><strong>{uniqueStudents.size}</strong><small>con información reportable</small></div>
          <div className="card stat risk"><span>En riesgo</span><strong>{riskStudents.size}</strong><small>{uniqueStudents.size?Math.round(riskStudents.size/uniqueStudents.size*100):0}% de estudiantes</small></div>
          <div className="card stat"><span>Programas</span><strong>{programs.size}</strong><small>en el filtro actual</small></div>
          <div className="card stat"><span>Registros</span><strong>{reportable.length}</strong><small>{filtered.length-reportable.length} sin reporte por bloque</small></div>
        </div>
        <div className="two-col">
          <section className="card page-card"><div className="section-head"><div><h2>Programas con mayor alerta</h2><p className="muted">Porcentaje de registros clasificados en riesgo.</p></div></div>
            <SimpleTable columns={[{key:'name',label:'Programa'},{key:'students',label:'Estudiantes'},{key:'risk',label:'Alertas'},{key:'pct',label:'% pérdida',render:r=><span className={r.pct>=30?'pill red':'pill'}>{r.pct}%</span>}]} rows={programRows.slice(0,8)}/>
          </section>
          <section className="card page-card"><div className="section-head"><div><h2>Estudiantes en riesgo</h2><p className="muted">Vista rápida del seguimiento prioritario.</p></div></div>
            <SimpleTable columns={[{key:'estudiante',label:'Estudiante'},{key:'programa',label:'Programa'},{key:'asignatura',label:'Asignatura'},{key:'promedio',label:'Nota / acumulado'}]} rows={riskRows.slice(0,8)}/>
          </section>
        </div>
      </>}

      {tab==='programas'&&<section className="card page-card"><div className="page-title compact"><div><h1>Programas</h1><p>Consolidado por programa académico.</p></div></div>
        <SimpleTable columns={[{key:'name',label:'Programa'},{key:'students',label:'Estudiantes'},{key:'total',label:'Registros evaluados'},{key:'risk',label:'Registros en riesgo'},{key:'pct',label:'% pérdida',render:r=><b>{r.pct}%</b>}]} rows={programRows}/>
      </section>}

      {tab==='docentes'&&<section className="card page-card"><div className="page-title compact"><div><h1>Docentes</h1><p>Total de estudiantes atendidos y relación de pérdida.</p></div></div>
        <SimpleTable columns={[{key:'name',label:'Docente'},{key:'students',label:'Total estudiantes'},{key:'total',label:'Registros'},{key:'risk',label:'En riesgo'},{key:'pct',label:'% pérdida',render:r=><span className={r.pct>=30?'pill red':'pill'}>{r.pct}%</span>}]} rows={teacherRows}/>
      </section>}

      {tab==='asignaturas'&&<section className="card page-card"><div className="page-title compact"><div><h1>Asignaturas</h1><p>Asignaturas consolidadas según el nombre reportado en la fuente.</p></div></div>
        <SimpleTable columns={[{key:'name',label:'Asignatura'},{key:'students',label:'Estudiantes'},{key:'total',label:'Registros'},{key:'risk',label:'En riesgo'},{key:'pct',label:'% pérdida'}]} rows={subjectRows}/>
      </section>}

      {tab==='bienestar'&&<section className="card page-card"><div className="page-title compact"><div><h1>Seguimiento de Bienestar</h1><p>Estudiantes identificados con alerta académica.</p></div><button className="primary inline" onClick={downloadBienestar}><FileDown size={16}/>Descargar</button></div>
        <div className="status-cards">
          {['Sin seguimiento','Contactado','No contactado','No interesado','Interesado en plan de mejoramiento'].map(s=>{
            const n=bienestarRows.filter(r=>(r.estadoBienestar||'Sin seguimiento')===s).length
            return <div className="mini-card" key={s}><b>{n}</b><span>{s}</span></div>
          })}
        </div>
        <SimpleTable columns={[{key:'estudiante',label:'Estudiante'},{key:'programa',label:'Programa'},{key:'asignaturas',label:'Asignaturas'},{key:'estadoBienestar',label:'Estado',render:r=>r.estadoBienestar||'Sin seguimiento'},{key:'observaciones',label:'Observaciones'}]} rows={bienestarRows}/>
      </section>}

      {tab==='fuente'&&<section className="card page-card"><div className="page-title compact"><div><h1>Fuente de datos</h1><p>Estado de sincronización del tablero.</p></div></div>
        <div className="source-grid">
          <div><span>Fuente</span><b>Google Sheets · Notas</b></div><div><span>Estado</span><b className={dataError?'bad':'good'}>{dataError?'Con error':'Conectada'}</b></div>
          <div><span>Registros recibidos</span><b>{data.length}</b></div><div><span>Última actualización</span><b>{updated?updated.toLocaleString('es-CO'):'—'}</b></div>
          <div><span>Campos detectados</span><b>{data[0]?Object.keys(data[0]).filter(k=>!k.startsWith('_')).length:0}</b></div><div><span>Periodo detectado</span><b>{[...new Set(data.map(r=>r.periodo).filter(Boolean))].join(', ')||'No identificado'}</b></div>
          <div><span>Porcentaje detectado</span><b>{data.some(r=>r._porcentajeRaw!=='')?'Sí':'No'}</b></div><div><span>Promedio detectado</span><b>{data.some(r=>r._promedioRaw!=='')?'Sí':'No'}</b></div>
        </div>
        <button className="primary inline" onClick={loadData}><RefreshCw size={16}/>Sincronizar ahora</button>
        <p className="muted source-note">La fuente configurada corresponde a la pestaña "Notas" de la hoja institucional de Alertas Tempranas. Los estudiantes de un bloque virtual aún no evaluado (0% y promedio 0) se excluyen de los reportes de riesgo.</p>
      </section>}

      {tab==='usuarios'&&profile?.role==='admin'&&<AdminUsers/>}
    </main>
  </div>
}

function App(){
  const [session,setSession]=useState(null),[profile,setProfile]=useState(null),[loading,setLoading]=useState(true)
  async function loadProfile(user){
    const {data}=await supabase.from('profiles').select('*').eq('id',user.id).single()
    setProfile(data)
  }
  useEffect(()=>{
    supabase.auth.getSession().then(async({data})=>{setSession(data.session);if(data.session?.user)await loadProfile(data.session.user);setLoading(false)})
    const {data:sub}=supabase.auth.onAuthStateChange(async(_event,next)=>{setSession(next);if(next?.user)await loadProfile(next.user);else setProfile(null)})
    return()=>sub.subscription.unsubscribe()
  },[])
  if(loading)return <div className="center">Cargando…</div>
  if(!session)return <Login onLogin={setSession}/>
  if(profile?.must_change_password)return <ForcePasswordChange user={session.user} onDone={()=>loadProfile(session.user)}/>
  return <Dashboard profile={profile}/>
}

createRoot(document.getElementById('root')).render(<App/>)
