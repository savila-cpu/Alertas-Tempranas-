import React, { useEffect, useMemo, useState } from 'react'
import { BookOpen, Plus, RefreshCw, Save, Search, UserPlus, X } from 'lucide-react'
import { supabase } from './supabase'

const CURRENT_MODULE = 3

function valueOrBlank(v){
  return v===null || v===undefined ? '' : v
}

export default function ETDHPanel({profile}){
  const canEdit=['admin','coordinator'].includes(profile?.role)
  const [students,setStudents]=useState([])
  const [grades,setGrades]=useState([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [program,setProgram]=useState('')
  const [moduleNumber,setModuleNumber]=useState(CURRENT_MODULE)
  const [search,setSearch]=useState('')
  const [showStudentForm,setShowStudentForm]=useState(false)
  const [newStudent,setNewStudent]=useState({document:'',full_name:'',program:'',status:'Activo'})
  const [editing,setEditing]=useState(null)
  const [saving,setSaving]=useState(false)

  async function load(){
    setLoading(true);setError('')
    const [{data:studentRows,error:studentError},{data:gradeRows,error:gradeError}]=await Promise.all([
      supabase.from('etdh_students').select('*').order('full_name'),
      supabase.from('etdh_module_grades').select('*')
    ])
    setLoading(false)
    if(studentError||gradeError){
      const message=studentError?.message||gradeError?.message||'No se pudo consultar ETDH.'
      if(String(message).toLowerCase().includes('etdh_')){
        setError('El módulo ETDH aún no está activado en Supabase. Ejecuta el script de configuración una sola vez.')
      }else setError('No se pudo cargar ETDH: '+message)
      return
    }
    setStudents(studentRows||[])
    setGrades(gradeRows||[])
  }

  useEffect(()=>{load()},[])

  const programs=useMemo(()=>[...new Set(students.map(x=>x.program).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')),[students])

  const gradeMap=useMemo(()=>{
    const m=new Map()
    grades.forEach(g=>m.set(g.student_id+'||'+g.module_number,g))
    return m
  },[grades])

  const rows=useMemo(()=>students
    .filter(s=>!program||s.program===program)
    .filter(s=>{
      const q=search.trim().toLowerCase()
      return !q||s.full_name.toLowerCase().includes(q)||s.document.toLowerCase().includes(q)||s.program.toLowerCase().includes(q)
    })
    .map(s=>{
      const g=gradeMap.get(s.id+'||'+moduleNumber)
      const fields=[g?.aplicativo,g?.formativo,g?.cognitivo]
      const completed=fields.every(v=>v!==null&&v!==undefined&&String(v)!=='')
      return {...s,grade:g||null,completed}
    }),[students,program,search,moduleNumber,gradeMap])

  const total=rows.length
  const completed=rows.filter(r=>r.completed).length
  const pending=total-completed

  async function addStudent(e){
    e.preventDefault()
    if(!canEdit)return
    setSaving(true);setError('');setNotice('')
    const payload={
      document:newStudent.document.trim(),
      full_name:newStudent.full_name.trim(),
      program:newStudent.program.trim(),
      status:newStudent.status,
      updated_at:new Date().toISOString()
    }
    const {error}=await supabase.from('etdh_students').insert(payload)
    setSaving(false)
    if(error){setError('No se pudo crear el estudiante: '+error.message);return}
    setNewStudent({document:'',full_name:'',program:'',status:'Activo'})
    setShowStudentForm(false)
    setNotice('Estudiante ETDH agregado correctamente.')
    await load()
  }

  function openGrade(row){
    const g=row.grade||{}
    setEditing({
      student_id:row.id,
      estudiante:row.full_name,
      program:row.program,
      module_number:moduleNumber,
      module_name:g.module_name||'',
      aplicativo:valueOrBlank(g.aplicativo),
      formativo:valueOrBlank(g.formativo),
      cognitivo:valueOrBlank(g.cognitivo),
      observations:g.observations||''
    })
    setNotice('');setError('')
  }

  async function saveGrade(e){
    e.preventDefault()
    if(!canEdit||!editing)return
    setSaving(true);setError('');setNotice('')
    const parse=v=>String(v).trim()===''?null:Number(v)
    const payload={
      student_id:editing.student_id,
      module_number:Number(editing.module_number),
      module_name:editing.module_name.trim()||null,
      aplicativo:parse(editing.aplicativo),
      formativo:parse(editing.formativo),
      cognitivo:parse(editing.cognitivo),
      observations:editing.observations.trim(),
      updated_by:profile?.id||null,
      updated_at:new Date().toISOString()
    }
    const {error}=await supabase.from('etdh_module_grades').upsert(payload,{onConflict:'student_id,module_number'})
    setSaving(false)
    if(error){setError('No se pudieron guardar las notas: '+error.message);return}
    setEditing(null)
    setNotice('Seguimiento del módulo guardado correctamente.')
    await load()
  }

  return <section className="etdh-page">
    <div className="page-title">
      <div>
        <h1>ETDH · Técnicos Laborales</h1>
        <p>Seguimiento modular independiente de los programas técnicos laborales.</p>
      </div>
      <button className="refresh" type="button" onClick={load}><RefreshCw size={16}/>Actualizar</button>
    </div>

    <div className="etdh-banner card">
      <div><span>Módulo actual</span><strong>3</strong></div>
      <p>ETDH maneja un solo corte por módulo. El cargue esperado de notas es <b>100%</b> y se controla mediante los parámetros <b>Aplicativo, Formativo y Cognitivo</b>.</p>
    </div>

    <div className="stats etdh-stats">
      <div className="card stat"><span>Estudiantes</span><strong>{total}</strong><small>en la selección actual</small></div>
      <div className="card stat"><span>Cargue completo</span><strong>{completed}</strong><small>100% de los 3 parámetros registrados</small></div>
      <div className="card stat risk"><span>Pendientes</span><strong>{pending}</strong><small>falta al menos un parámetro</small></div>
      <div className="card stat"><span>Módulo consultado</span><strong>{moduleNumber}</strong><small>{moduleNumber===CURRENT_MODULE?'módulo actual':'módulo histórico'}</small></div>
    </div>

    {notice&&<div className="banner info">{notice}</div>}
    {error&&<div className="banner danger">{error}</div>}

    <section className="card page-card">
      <div className="section-head">
        <div><h2>Seguimiento de estudiantes</h2><p className="muted">Consulta el avance de cargue del módulo seleccionado.</p></div>
        {canEdit&&<button className="primary inline" type="button" onClick={()=>setShowStudentForm(v=>!v)}>{showStudentForm?<X size={16}/>:<UserPlus size={16}/>} {showStudentForm?'Cerrar':'Agregar estudiante'}</button>}
      </div>

      {showStudentForm&&<form className="etdh-student-form" onSubmit={addStudent}>
        <label>Identificación<input required value={newStudent.document} onChange={e=>setNewStudent(v=>({...v,document:e.target.value}))}/></label>
        <label>Nombre completo<input required value={newStudent.full_name} onChange={e=>setNewStudent(v=>({...v,full_name:e.target.value}))}/></label>
        <label>Programa técnico laboral<input required value={newStudent.program} onChange={e=>setNewStudent(v=>({...v,program:e.target.value}))}/></label>
        <label>Estado<select value={newStudent.status} onChange={e=>setNewStudent(v=>({...v,status:e.target.value}))}><option>Activo</option><option>Inactivo</option><option>Retirado</option><option>Finalizado</option></select></label>
        <button className="primary inline" disabled={saving}><Plus size={16}/>{saving?'Guardando…':'Crear estudiante'}</button>
      </form>}

      <div className="etdh-filters">
        <label>Programa<select value={program} onChange={e=>setProgram(e.target.value)}><option value="">Todos</option>{programs.map(p=><option key={p}>{p}</option>)}</select></label>
        <label>Módulo<select value={moduleNumber} onChange={e=>setModuleNumber(Number(e.target.value))}>{Array.from({length:12},(_,i)=>i+1).map(n=><option key={n} value={n}>Módulo {n}{n===CURRENT_MODULE?' · actual':''}</option>)}</select></label>
        <label className="etdh-search">Buscar<div><Search size={16}/><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nombre, identificación o programa"/></div></label>
      </div>

      <div className="etdh-table-wrap">
        <table className="data-table etdh-table">
          <thead><tr><th>Estudiante</th><th>Programa</th><th>Aplicativo</th><th>Formativo</th><th>Cognitivo</th><th>Cargue</th><th>Observaciones</th>{canEdit&&<th>Acción</th>}</tr></thead>
          <tbody>
            {rows.map(r=><tr key={r.id}>
              <td><strong>{r.full_name}</strong><div className="muted">{r.document}</div></td>
              <td>{r.program}</td>
              <td>{valueOrBlank(r.grade?.aplicativo)===''?'—':r.grade.aplicativo}</td>
              <td>{valueOrBlank(r.grade?.formativo)===''?'—':r.grade.formativo}</td>
              <td>{valueOrBlank(r.grade?.cognitivo)===''?'—':r.grade.cognitivo}</td>
              <td><span className={'status-badge '+(r.completed?'on':'pending')}>{r.completed?'100% completo':'Pendiente'}</span></td>
              <td>{r.grade?.observations||'—'}</td>
              {canEdit&&<td><button type="button" className="refresh" onClick={()=>openGrade(r)}>Editar notas</button></td>}
            </tr>)}
            {!loading&&rows.length===0&&<tr><td colSpan={canEdit?8:7} className="muted">No hay estudiantes ETDH para los filtros seleccionados.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>

    {editing&&<section className="card page-card etdh-edit-card">
      <div className="section-head"><div><h2>Notas · {editing.estudiante}</h2><p className="muted">{editing.program} · Módulo {editing.module_number}</p></div><button type="button" className="ghost small" onClick={()=>setEditing(null)}><X size={16}/>Cerrar</button></div>
      <form onSubmit={saveGrade}>
        <div className="etdh-grade-grid">
          <label>Nombre del módulo<input value={editing.module_name} onChange={e=>setEditing(v=>({...v,module_name:e.target.value}))} placeholder="Opcional"/></label>
          <label>Aplicativo<input type="number" step="0.01" value={editing.aplicativo} onChange={e=>setEditing(v=>({...v,aplicativo:e.target.value}))}/></label>
          <label>Formativo<input type="number" step="0.01" value={editing.formativo} onChange={e=>setEditing(v=>({...v,formativo:e.target.value}))}/></label>
          <label>Cognitivo<input type="number" step="0.01" value={editing.cognitivo} onChange={e=>setEditing(v=>({...v,cognitivo:e.target.value}))}/></label>
        </div>
        <label className="etdh-observations">Observaciones<textarea rows={4} value={editing.observations} onChange={e=>setEditing(v=>({...v,observations:e.target.value}))}/></label>
        <div className="etdh-load-note"><BookOpen size={17}/><span>El cargue se marca como <b>100% completo</b> únicamente cuando Aplicativo, Formativo y Cognitivo tienen una nota registrada.</span></div>
        <button className="primary inline" disabled={saving}><Save size={16}/>{saving?'Guardando…':'Guardar seguimiento'}</button>
      </form>
    </section>}
  </section>
}
