# Alertas Tempranas - La Litoral

Base lista para GitHub con autenticación, usuarios, roles, contraseña temporal y cambio obligatorio en el primer ingreso.

## 1. Subir a GitHub

1. Crea un repositorio vacío en GitHub, por ejemplo `alertas-tempranas-litoral`.
2. Descomprime este proyecto.
3. Abre una terminal dentro de la carpeta y ejecuta:

```bash
git init
git add .
git commit -m "Versión inicial Alertas Tempranas"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/alertas-tempranas-litoral.git
git push -u origin main
```

También puedes subir los archivos desde GitHub > Add file > Upload files.

## 2. Crear Supabase

1. Entra a Supabase y crea un proyecto.
2. Ve a **Project Settings > API** y copia:
   - Project URL
   - anon public key
3. Crea un archivo `.env` desde `.env.example` y completa ambos valores.
4. Ve a **SQL Editor** y ejecuta `supabase/schema.sql`.

## 3. Crear el primer administrador

1. En Supabase > Authentication > Users crea tu usuario con correo y contraseña.
2. En SQL Editor ejecuta, reemplazando el correo:

```sql
insert into public.profiles (id,email,full_name,role,must_change_password)
select id,email,'Administrador','admin',false
from auth.users
where email='TU_CORREO@litoral.edu.co';
```

## 4. Desplegar la función para crear usuarios

La creación de usuarios no debe hacerse desde el navegador con la service role key. Por eso se incluye una Edge Function.

Con Supabase CLI:

```bash
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase functions deploy create-user
```

La función usa automáticamente `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` del proyecto.

## 5. Probar localmente

```bash
npm install
npm run dev
```

## 6. Publicar desde GitHub

### Vercel
1. Crea cuenta/inicia sesión en Vercel.
2. Importa el repositorio de GitHub.
3. Framework: **Vite**.
4. Agrega las variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy.

### Netlify
1. Add new site > Import from Git.
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Agrega las mismas variables de entorno.

## 7. Flujo de usuarios incluido

- El administrador crea: nombre, correo, rol y contraseña temporal.
- El usuario inicia sesión con la contraseña temporal.
- El sistema detecta `must_change_password = true`.
- Obliga a crear una nueva contraseña.
- Después del cambio accede normalmente.

## 8. Seguridad importante

- Nunca subas `.env` a GitHub.
- Nunca pongas la `SERVICE_ROLE_KEY` en React/Vite.
- La creación de usuarios se realiza únicamente en la Edge Function.
- Mantén Row Level Security (RLS) habilitado.

## 9. Siguiente paso para tu tablero real

Esta base deja resuelto el acceso y la administración de usuarios. Para migrar exactamente el tablero existente (Programas, Docentes, Asignaturas, Bienestar, filtros, exportación Excel y Google Sheets), hay que trasladar sus componentes y reglas al bloque principal de `src/main.jsx` o separarlos en componentes.
