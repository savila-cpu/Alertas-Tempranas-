import React, { useEffect, useMemo, useState } from 'react'
import { Camera, Save, UserRound, X } from 'lucide-react'
import { supabase } from './supabase'

const blankProfile=(teacherKey,fullName)=>({
  teacher_key:teacherKey,
  full_name:fullName,
  identification:'',
  institutional_email:'',
  phone:'',
  profession:'',
  education_level:'',
  employment_type:'',
  dedication:'',
  program_coordination:'',
  status:'Activo',
  photo_path:''
})

export default function TeacherProfile({teacherKey,teacherName,academicRows=[],pendingRows=[],canEdit,onClose,userId}){
  const [form,setForm]=useState(()=>blankProfile(teacherKey,teacherName))
  const [photoUrl,setPhotoUrl]=useState('')
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [uploading,setUploading]=useState(false)
  const [notice,setNotice]=useState('')
  const [error,setError]=useState('')

  const metrics=useMemo(()=>{
    const students=new Set()
    const riskStudents=new Set()
    const subjects=new Set()
    const programs=new Set()
    for(const row of academicRows){
      const id=String(row.documento||row.estudiante||'').trim()
      if(id){
        students.add(id)
        if(row.enRiesgo)riskStudents.add(id)
      }
      if(row.asignatura)subjects.add(row.asignatura)
      if(row.programa)programs.add(row.programa)
    }
    return {
      students:students.size,
      risk:riskStudents.size,
      subjects:subjects.size,
      programs:programs.size,
      pending:pendingRows.length
    }
  },[academicRows,pendingRows])

  async function signedPhoto(path){
    if(!path){setPhotoUrl('');return}
    const {data,error}=await supabase.storage.from('teacher-photos').createSignedUrl(path,60*60)
    if(error){setPhotoUrl('');return}
    setPhotoUrl(data?.signedUrl||'')
  }

  async function load(){
    setLoading(true);setError('');setNotice('')
    const {data,error}=await supabase.from('teacher_profiles').select('*').eq('teacher_key',teacherKey).maybeSingle()
    if(error){
      if(String(error.message||'').toLowerCase().includes('teacher_profiles')){
        setError('Los perfiles docentes aún no están activados en Supabase. Ejecuta el script de configuración una sola vez.')
      }else{
        setError('No se pudo cargar el perfil: '+error.message)
      }
      setForm(blankProfile(teacherKey,teacherName))
      setLoading(false)
      return
    }
    const next=data?{...blankProfile(teacherKey,teacherName),...data}:blankProfile(teacherKey,teacherName)
    setForm(next)
    await signedPhoto(next.photo_path)
    setLoading(false)
  }

  useEffect(()=>{load()},[teacherKey])

  async function save(e){
    e.preventDefault()
    if(!canEdit)return
    setSaving(true);setError('');setNotice('')
    const payload={...form,teacher_key:teacherKey,full_name:teacherName,updated_by:userId,updated_at:new Date().toISOString()}
    const {error}=await supabase.from('teacher_profiles').upsert(payload,{onConflict:'teacher_key'})
    setSaving(false)
    if(error){setError('No se pudo guardar el perfil: '+error.message);return}
    setForm(payload)
    setNotice('Perfil docente actualizado correctamente.')
  }

  async function uploadPhoto(e){
    const file=e.target.files?.[0]
    e.target.value=''
    if(!file||!canEdit)return
    if(!file.type.startsWith('image/')){setError('Selecciona un archivo de imagen.');return}
    if(file.size>5*1024*1024){setError('La foto no debe superar 5 MB.');return}
    setUploading(true);setError('');setNotice('')
    const ext=(file.name.split('.').pop()||'jpg').replace(/[^a-z0-9]/gi,'').toLowerCase()||'jpg'
    const path=teacherKey+'/'+Date.now()+'.'+ext
    const {error:uploadError}=await supabase.storage.from('teacher-photos').upload(path,file,{upsert:false,contentType:file.type})
    if(uploadError){setUploading(false);setError('No se pudo subir la foto: '+uploadError.message);return}
    const old=form.photo_path
    const next={...form,photo_path:path}
    const {error:updateError}=await supabase.from('teacher_profiles').upsert({...next,teacher_key:teacherKey,full_name:teacherName,updated_by:userId,updated_at:new Date().toISOString()},{onConflict:'teacher_key'})
    if(updateError){
      await supabase.storage.from('teacher-photos').remove([path])
      setUploading(false);setError('La foto se subió, pero no se pudo asociar al perfil: '+updateError.message);return
    }
    if(old)await supabase.storage.from('teacher-photos').remove([old])
    setForm(next)
    await signedPhoto(path)
    setUploading(false)
    setNotice('Foto de perfil actualizada.')
  }

  const fields=[
    ['identification','Identificación'],
    ['institutional_email','Correo institucional'],
    ['phone','Teléfono'],
    ['profession','Profesión'],
    ['education_level','Nivel de formación'],
    ['employment_type','Tipo de vinculación'],
    ['dedication','Dedicación'],
    ['program_coordination','Programa / coordinación']
  ]

  return <section className="teacher-profile">
    <div className="teacher-profile-top">
      <button type="button" className="ghost small" onClick={onClose}><X size={16}/>Volver a docentes</button>
    </div>
    <div className="teacher-profile-hero">
      <div className="teacher-avatar">
        {photoUrl?<img src={photoUrl} alt={'Foto de '+teacherName}/>:<UserRound size={62}/>}
        {canEdit&&<label className="teacher-photo-action"><Camera size={15}/>{uploading?'Subiendo…':'Cambiar foto'}<input type="file" accept="image/*" onChange={uploadPhoto} disabled={uploading}/></label>}
      </div>
      <div>
        <p className="teacher-kicker">Perfil del profesor</p>
        <h1>{teacherName}</h1>
        <p className="muted">{form.profession||'Información profesional pendiente'} · {form.status||'Activo'}</p>
      </div>
    </div>

    <div className="stats teacher-profile-stats">
      <div className="card stat"><span>Estudiantes atendidos</span><strong>{metrics.students}</strong><small>estudiantes únicos</small></div>
      <div className="card stat risk"><span>Estudiantes en riesgo</span><strong>{metrics.risk}</strong><small>con al menos una asignatura en riesgo</small></div>
      <div className="card stat"><span>Asignaturas</span><strong>{metrics.subjects}</strong><small>asignaturas asociadas</small></div>
      <div className="card stat"><span>Notas pendientes</span><strong>{metrics.pending}</strong><small>registros con cargue incompleto</small></div>
    </div>

    {notice&&<div className="banner info">{notice}</div>}
    {error&&<div className="banner danger">{error}</div>}

    <form className="teacher-profile-form card" onSubmit={save}>
      <div className="section-head"><div><h2>Información personal y profesional</h2><p className="muted">{canEdit?'Puedes completar y actualizar estos datos.':'Consulta de información registrada.'}</p></div></div>
      {loading?<p className="muted">Cargando perfil…</p>:<>
        <div className="teacher-form-grid">
          {fields.map(([key,label])=><label key={key}>{label}<input value={form[key]||''} disabled={!canEdit} onChange={e=>setForm(v=>({...v,[key]:e.target.value}))}/></label>)}
          <label>Estado
            <select value={form.status||'Activo'} disabled={!canEdit} onChange={e=>setForm(v=>({...v,status:e.target.value}))}>
              <option>Activo</option><option>Inactivo</option>
            </select>
          </label>
        </div>
        {canEdit&&<button className="primary inline" disabled={saving}><Save size={16}/>{saving?'Guardando…':'Guardar perfil'}</button>}
      </>}
    </form>

    <div className="two-col">
      <section className="card page-card">
        <div className="section-head"><div><h2>Programas y asignaturas</h2><p className="muted">Información obtenida de la fuente académica actual.</p></div></div>
        <div className="teacher-chip-list">{[...new Set(academicRows.map(r=>r.programa).filter(Boolean))].map(x=><span key={x}>{x}</span>)}</div>
        <div className="teacher-subject-list">{[...new Set(academicRows.map(r=>r.asignatura).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')).map(x=><div key={x}>{x}</div>)}</div>
      </section>
      <section className="card page-card">
        <div className="section-head"><div><h2>Notas pendientes por cargar</h2><p className="muted">Estado actual según el corte y porcentaje esperado.</p></div></div>
        {pendingRows.length?pendingRows.slice(0,12).map((r,i)=><div className="teacher-pending-row" key={i}><div><strong>{r.asignatura}</strong><span>{r.programa}</span></div><b>{r.porcentaje}% / {r.porcentajeEsperado}%</b></div>):<p className="muted">No tiene notas pendientes en la selección actual.</p>}
      </section>
    </div>
  </section>
}
