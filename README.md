# Pilar Empleo IA

Aplicación React + Vite para organizar la búsqueda de empleo, preparar candidaturas, consultar el asistente y mostrar un currículum público con código QR.

## Requisitos

- Node.js 20.19 o posterior.
- npm.

## Ejecutar en local

```powershell
npm install
npm run dev
```

El servidor local queda disponible en `http://localhost:3017`. Para probar la versión de producción:

```powershell
npm run build
npm start
```

## Configuración opcional

Copia `.env.example` a `.env.local` y configura los valores que necesites. `GEMINI_API_KEY` activa el asistente con Gemini; sin esa clave se usan respuestas locales de respaldo.

La configuración de Firebase se proporciona como JSON en `VITE_FIREBASE_CONFIG`. Los datos de contacto reales se configuran con `VITE_PILAR_EMAIL`, `VITE_PILAR_PHONE` y `VITE_PILAR_ADDRESS`. Al ser una aplicación de navegador, cualquier valor `VITE_` incluido en un build puede ser visible para sus visitantes. No configures datos que no quieras hacer públicos. El DNI no se proporciona como valor predeterminado.

No publiques `.env.local`, claves de Gemini, la configuración privada de Firebase ni fotografías personales. `.env*`, `firebase-applet-config.json` y las fotos originales están excluidos de Git; el proyecto incluye imágenes genéricas de reemplazo.

Para desplegar en Vercel, importa el repositorio y usa el comando de build `npm run build`; la configuración SPA está en `vercel.json`.
