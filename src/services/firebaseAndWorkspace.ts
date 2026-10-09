import { FirebaseOptions, initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  collection,
  query,
  where,
  getDocs,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { RegistroCandidaturaKanban } from '../data/pilarProfile';

interface FirebaseAppConfig extends FirebaseOptions {
  firestoreDatabaseId?: string;
}

function isFirebaseAppConfig(value: unknown): value is FirebaseAppConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    'apiKey' in value &&
    typeof value.apiKey === 'string' &&
    'authDomain' in value &&
    typeof value.authDomain === 'string' &&
    'projectId' in value &&
    typeof value.projectId === 'string' &&
    'appId' in value &&
    typeof value.appId === 'string' &&
    (!('firestoreDatabaseId' in value) ||
      typeof value.firestoreDatabaseId === 'string')
  );
}

function getFirebaseConfig(): FirebaseAppConfig {
  const rawConfig = import.meta.env.VITE_FIREBASE_CONFIG;
  if (!rawConfig) {
    return {
      apiKey: 'demo-api-key',
      authDomain: 'localhost',
      projectId: 'demo-project',
      appId: 'demo-app',
    };
  }

  let parsedConfig: unknown;
  try {
    parsedConfig = JSON.parse(rawConfig);
  } catch (error) {
    throw new Error('VITE_FIREBASE_CONFIG debe contener un objeto JSON válido.', {
      cause: error,
    });
  }
  if (!isFirebaseAppConfig(parsedConfig)) {
    throw new Error('VITE_FIREBASE_CONFIG no contiene una configuración válida.');
  }
  return parsedConfig;
}

const firebaseConfig = getFirebaseConfig();
const app = initializeApp(firebaseConfig);
export const db = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);
export const auth = getAuth(app);

// Validate connection to Firestore on boot (Mandatory per firebase-integration-rpc)
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// ============================================================================
// GOOGLE WORKSPACE OAUTH SCOPES & IN-MEMORY TOKEN MANAGEMENT
// ============================================================================
export const SCOPES = [
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/documents',
];

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

// ============================================================================
// FIRESTORE CLOUD PERSISTENCE FOR PILAR'S KANBAN & 10-DAY PLAN
// ============================================================================
export async function syncCandidaturasToFirestore(
  registros: RegistroCandidaturaKanban[]
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;

  for (const reg of registros) {
    const safeId = reg.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
    const path = `candidaturas/${safeId}`;
    try {
      const candidaturaRef = doc(db, 'candidaturas', safeId);
      const existing = await getDocFromServer(candidaturaRef);
      await setDoc(candidaturaRef, {
        ownerId: user.uid,
        ofertaId: (reg.ofertaId || '').slice(0, 128),
        empresa: (reg.empresa || 'Empresa').slice(0, 200),
        puesto: (reg.puesto || 'Puesto').slice(0, 200),
        localidad: (reg.localidad || 'Torrijos').slice(0, 120),
        fecha: (reg.fecha || '2026-10-07').slice(0, 40),
        fuente: (reg.fuente || 'Directa').slice(0, 160),
        enlace: (reg.enlace || '').slice(0, 500),
        estado: reg.estado,
        notas: (reg.notas || '').slice(0, 2000),
        fechaSeguimiento: (reg.fechaSeguimiento || '').slice(0, 40),
        contacto: (reg.contacto || '').slice(0, 200),
        resultado: (reg.resultado || '').slice(0, 200),
        createdAt: existing.exists()
          ? existing.data().createdAt
          : serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }
}

export async function loadCandidaturasFromFirestore(): Promise<
  RegistroCandidaturaKanban[] | null
> {
  const user = auth.currentUser;
  if (!user) return null;
  const path = 'candidaturas';
  try {
    const q = query(
      collection(db, 'candidaturas'),
      where('ownerId', '==', user.uid)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ofertaId: data.ofertaId || undefined,
        empresa: data.empresa,
        puesto: data.puesto,
        localidad: data.localidad,
        fecha: data.fecha,
        fuente: data.fuente,
        enlace: data.enlace,
        estado: data.estado,
        notas: data.notas,
        fechaSeguimiento: data.fechaSeguimiento,
        contacto: data.contacto,
        resultado: data.resultado,
      } as RegistroCandidaturaKanban;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

// ============================================================================
// GOOGLE WORKSPACE API HELPERS (DOCS, DRIVE, GMAIL, CALENDAR)
// ============================================================================
export async function createGoogleDocWithContent(
  title: string,
  bodyText: string
): Promise<{ documentId: string; webViewLink: string }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Inicia sesión con Google primero.');

  // 1. Create document in Google Docs
  const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title }),
  });

  if (!createRes.ok) {
    throw new Error('No se pudo crear el documento en Google Docs.');
  }

  const createdDoc = await createRes.json();
  const documentId = createdDoc.documentId as string;

  // 2. Insert text via batchUpdate
  await fetch(
    `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: bodyText,
            },
          },
        ],
      }),
    }
  );

  return {
    documentId,
    webViewLink: `https://docs.google.com/document/d/${documentId}/edit`,
  };
}

export async function listRecentDriveFiles(): Promise<
  { id: string; name: string; mimeType: string; webViewLink?: string }[]
> {
  const token = await getAccessToken();
  if (!token) throw new Error('Inicia sesión con Google primero.');

  const res = await fetch(
    'https://www.googleapis.com/drive/v3/files?pageSize=8&fields=files(id,name,mimeType,webViewLink)&orderBy=modifiedTime desc',
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) throw new Error('Error al consultar Google Drive.');
  const data = await res.json();
  return data.files || [];
}

export async function createCalendarFollowUpEvent(params: {
  summary: string;
  description: string;
  location: string;
  dateYYYYMMDD: string;
}): Promise<{ htmlLink: string }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Inicia sesión con Google primero.');

  const startDateTime = `${params.dateYYYYMMDD}T10:00:00`;
  const endDateTime = `${params.dateYYYYMMDD}T11:00:00`;

  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: params.summary,
        location: params.location,
        description: params.description,
        start: {
          dateTime: startDateTime,
          timeZone: 'Europe/Madrid',
        },
        end: {
          dateTime: endDateTime,
          timeZone: 'Europe/Madrid',
        },
      }),
    }
  );

  if (!res.ok) {
    throw new Error('No se pudo agendar el evento en Google Calendar.');
  }
  const data = await res.json();
  return { htmlLink: data.htmlLink || 'https://calendar.google.com' };
}

export async function listUpcomingCalendarEvents(): Promise<
  { id: string; summary: string; start: string; htmlLink?: string }[]
> {
  const token = await getAccessToken();
  if (!token) throw new Error('Inicia sesión con Google primero.');

  const nowIso = new Date().toISOString();
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=6&singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(
      nowIso
    )}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) throw new Error('Error al consultar Google Calendar.');
  const data = await res.json();
  return (data.items || []).map((it: any) => ({
    id: it.id,
    summary: it.summary || 'Evento sin título',
    start: it.start?.dateTime || it.start?.date || '',
    htmlLink: it.htmlLink,
  }));
}

export async function createOrSendGmailCandidatura(params: {
  toEmail: string;
  subject: string;
  bodyText: string;
  mode: 'draft' | 'send';
}): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Inicia sesión con Google primero.');

  const utf8Subject = `=?utf-8?B?${btoa(
    unescape(encodeURIComponent(params.subject))
  )}?=`;
  const mimeMessage = [
    `To: ${params.toEmail}`,
    `Subject: ${utf8Subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    params.bodyText,
  ].join('\r\n');

  const rawBase64Url = btoa(unescape(encodeURIComponent(mimeMessage)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const endpoint =
    params.mode === 'send'
      ? 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'
      : 'https://gmail.googleapis.com/gmail/v1/users/me/drafts';

  const payload =
    params.mode === 'send'
      ? { raw: rawBase64Url }
      : { message: { raw: rawBase64Url } };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error('No se pudo procesar el correo en Gmail.');
  }
}
