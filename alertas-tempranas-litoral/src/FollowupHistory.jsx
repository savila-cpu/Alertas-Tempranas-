import React, { useEffect, useRef, useState, useId } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabase'
import './followup-history.css'

const PAGE_SIZE = 30
const ROLE_NAMES = { admin:'Administrador', bienestar:'Bienestar', coordinator:'Coordinación', viewer:'Consulta' }
const LABELS = { initial:'Registro inicial', insert:'Seguimiento creado', update:'Seguimiento actualizado', delete:'Seguimiento eliminado' }

function dateLabel(value){
  if(!value)return 'Fecha no disponible'
  const d=new Date(value)
  return Number.isNaN(d.getTime()) ? 'Fecha no disponible' : d.toLocaleString('es-CO', {timeZone:'America/Bogota',dateStyle:'medium',timeStyle:'short'})
}

function Snapshot({title,value}){
  return <div className="fh-snapshot">
    <h4>{title}</h4>
    {value ? <>
      <p><strong>Estado: </strong>{value.estado || 'Sin seguimiento'}</p>
      <p className="fh-notes"><strong>Observaciones: </strong>{value.observaciones || 'Sin observaciones'}</p>
    </> : <p className="muted">No existe un seguimiento en este momento de la historia.</p>}
  </div>
}

function HistoryEntry({entry}){
  const before=entry.before_data
  const after=entry.after_data
  const stateChanged=entry.action==='update' && before?.estado!==after?.estado
  const notesChanged=entry.action==='update' && before?.observaciones!==after?.observaciones
  return <article className="fh-entry">
    <div className="fh-entry-head">
      <strong>{LABELS[entry.action] || entry.action}</strong>
      <time dateTime={entry.occurred_at}>{dateLabel(entry.occurred_at)}</time>
    </div>
    <p className="fh-author">{entry.actor_name || 'Responsable no disponible'}{entry.actor_role ? ' · '+(ROLE_NAMES[entry.actor_role] || entry.actor_role) : ''}</p>
    {entry.action==='initial' && <p className="fh-hint">Copia del seguimiento disponible al activar el historial. No reconstruye las interacciones anteriores.</p>}
    {entry.action==='update' && <p className="fh-hint">{stateChanged && notesChanged ? 'Se modificaron el estado y las observaciones.' : stateChanged ? 'Se modificó el estado.' : notesChanged ? 'Se modificaron las observaciones.' : 'Se guardó una nueva interacción sin cambios en el estado o el texto.'}</p>}
    <div className="fh-snapshots">
      {(entry.action==='update' || entry.action==='delete') && <Snapshot title={entry.action==='delete'?'Seguimiento que se eliminó':'Antes del cambio'} value={before}/>}
      {entry.action!=='delete' && <Snapshot title={entry.action==='initial'?'Estado conservado':'Estado registrado'} value={after}/>}
    </div>
  </article>
}

function HistoryDialog({studentKey,student,onClose}){
  const dialogRef=useRef(null)
  const requestId=useRef(0)
  const activeRequest=useRef(null)
  const titleId=useId()
  const [entries,setEntries]=useState([])
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [hasMore,setHasMore]=useState(false)
  const [cursor,setCursor]=useState(null)

  async function loadPage(older=false){
    if(loading && older)return
    const id=++requestId.current
    activeRequest.current?.abort()
    const controller=new AbortController()
    activeRequest.current=controller
    const timeout=setTimeout(()=>controller.abort(),20000)
    setLoading(true);setError('')
    try{
      let query=supabase.from('student_followup_history')
        .select('id,student_key,action,occurred_at,actor_name,actor_role,before_data,after_data')
        .eq('student_key',studentKey).order('id',{ascending:false}).limit(PAGE_SIZE+1)
      if(older && cursor!==null)query=query.lt('id',cursor)
      const {data,error:queryError}=await query.abortSignal(controller.signal)
      if(queryError)throw queryError
      if(id!==requestId.current)return
      const rows=(data||[]).slice(0,PAGE_SIZE)
      setEntries(previous=>older?[...previous,...rows]:rows)
      setCursor(rows.length?rows[rows.length-1].id:null)
      setHasMore((data||[]).length>PAGE_SIZE)
    }catch(err){
      if(id!==requestId.current)return
      const missing=['42P01','PGRST205'].includes(err?.code)
      setError(missing
        ? 'Falta activar el historial en Supabase. La administración debe ejecutar 20261020_followup_history.sql.'
        : controller.signal.aborted
          ? 'La consulta tardó demasiado. Pulsa Actualizar para reintentar.'
          : 'No se pudo consultar el historial: '+String(err?.message||err))
    }finally{
      clearTimeout(timeout)
      if(id===requestId.current)setLoading(false)
    }
  }

  useEffect(()=>{
    const dialog=dialogRef.current
    const previousFocus=document.activeElement
    const oldOverflow=document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow='hidden'
    loadPage()
    return ()=>{
      ++requestId.current
      activeRequest.current?.abort()
      dialog.close()
      document.body.style.overflow=oldOverflow
      if(previousFocus instanceof HTMLElement && previousFocus.isConnected)previousFocus.focus()
    }
  },[studentKey])

  return createPortal(<dialog ref={dialogRef} className="fh-dialog" aria-labelledby={titleId}
    onCancel={e=>{e.preventDefault();onClose()}}>
    <header className="fh-header">
      <div><p className="fh-eyebrow">PERFIL DEL ESTUDIANTE</p><h2 id={titleId}>Historial de seguimiento</h2></div>
      <button type="button" className="refresh" autoFocus onClick={onClose}>Cerrar</button>
    </header>
    <section className="fh-profile">
      <strong>{student.estudiante || 'Estudiante'}</strong>
      <span>{student.documento?'Identificación: '+student.documento:'Referencia: '+studentKey}</span>
      {student.programa && <span>{student.programa}</span>}
    </section>
    <div className="fh-toolbar">
      <p>Interacciones más recientes primero. Horario de Colombia.</p>
      <button type="button" className="refresh" disabled={loading} onClick={()=>loadPage(false)}>{loading?'Cargando...':'Actualizar'}</button>
    </div>
    <p className="fh-hint">Se conservan las gestiones guardadas, incluidos sus cambios y eliminaciones. El historial es de solo lectura y no depende de los filtros de bloque o corte.</p>
    {error && <p className="fh-error" role="alert">{error}</p>}
    {!loading && !error && entries.length===0 && <p className="fh-empty">Este estudiante aún no tiene interacciones registradas en el historial.</p>}
    <div className="fh-events" aria-busy={loading}>{entries.map(entry=><HistoryEntry key={entry.id} entry={entry}/>)}</div>
    <footer className="fh-footer">
      <span>{entries.length} registros cargados</span>
      {hasMore && <button type="button" className="refresh" disabled={loading} onClick={()=>loadPage(true)}>Ver interacciones anteriores</button>}
    </footer>
  </dialog>,document.body)
}

export default function FollowupHistoryButton({student,disabled=false}){
  const [open,setOpen]=useState(false)
  const studentKey=String(student.documento||student.estudiante||'').trim()
  return <>
    <button type="button" className="refresh" disabled={disabled||!studentKey} onClick={()=>setOpen(true)}
      aria-label={'Ver historial de '+(student.estudiante||'este estudiante')}>Ver historial</button>
    {open && <HistoryDialog key={studentKey} studentKey={studentKey} student={student} onClose={()=>setOpen(false)}/>}
  </>
}
