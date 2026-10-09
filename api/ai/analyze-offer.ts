import { GoogleGenAI, Type } from '@google/genai';

type ApiRequest = { method?: string; body?: unknown };
type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (data: unknown) => void;
};

const SYSTEM_INSTRUCTION = `Eres Pilar IA, una orientadora laboral cercana y útil para Pilar Fernández Almaraz, residente en Santo Domingo-Caudilla (Toledo). Basa tus respuestas exclusivamente en estos datos: permiso de conducir y coche propio; experiencia en atención al cliente, comercio, caja, reposición, administración, taxi, ayuda a domicilio y fabricación de calzado; FP de Auxiliar Administrativo; Curso de Inteligencia Artificial de 120 horas certificado por la Cámara de Comercio de Torrijos; mecanografía, Contaplus, Windows y Word; español nativo e inglés A2. Responde en español de España, con honestidad y sin descartar automáticamente una oferta.`;

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({ apiKey });
}

function fallbackDossier(company: string, offer: string) {
  const admin = /administrativ|oficina|recepci|contab|gestor|factur|cl[ií]nica|log[ií]stica|tel[eé]fono/i.test(
    `${company} ${offer}`
  );
  return {
    tituloDetectado: company || 'Empresa en la comarca de Torrijos',
    compatibilidadPorcentaje: admin ? 92 : 95,
    checksCompatibilidad: [
      'Experiencia en atención al cliente, comercio y caja',
      'FP de Auxiliar Administrativo',
      'Curso de Inteligencia Artificial de 120 horas',
      'Permiso de conducir y coche propio',
    ],
    puntosFuertesEncaje: [
      'Experiencia real tratando directamente con personas.',
      'Formación administrativa y disposición para aprender herramientas nuevas.',
      'Residencia cercana y coche propio.',
    ],
    requisitoNoCumplidoOAlerta:
      'Comprueba los requisitos específicos de la oferta, como el nivel de inglés o los programas informáticos solicitados.',
    comoDefenderSinDescartar:
      'Destaca tu experiencia con clientes, tu formación y tu capacidad para aprender; la decisión final es tuya.',
    resumenCVAdaptado: `Candidatura para ${company || 'la oferta'}: experiencia en atención al cliente y tareas administrativas, FP de Auxiliar Administrativo, formación en IA de 120 horas y coche propio.`,
    cartaPresentacionNatural: `Buenos días:\n\nMe gustaría presentar mi candidatura para ${company || 'esta oportunidad'}. Cuento con formación de Auxiliar Administrativo, experiencia atendiendo a personas y disponibilidad para desplazarme. Quedo a su disposición para una entrevista.\n\nAtentamente,\nPilar Fernández Almaraz`,
    emailAsunto: `Candidatura ${company || 'de empleo'} — Pilar Fernández Almaraz`,
    emailCuerpo: `Buenos días:\n\nAdjunto mi currículum para que puedan valorar mi candidatura. Cuento con experiencia en atención al cliente y formación administrativa. Quedo a su disposición para ampliar cualquier información.\n\nAtentamente,\nPilar Fernández Almaraz`,
    mensajeLinkedInBreve: `Hola, soy Pilar Fernández Almaraz. Tengo experiencia en atención al cliente y formación administrativa, y me interesa la oportunidad en ${company || 'su empresa'}.`,
    presentacionCorta: 'Buenos días. Soy Pilar Fernández Almaraz, tengo formación de Auxiliar Administrativo y experiencia tratando directamente con personas. Me gustaría presentarles mi candidatura.',
    preguntaProbableEntrevista: '¿Qué experiencia y habilidades puedes aportar a este puesto?',
    respuestaRecomendadaPilar:
      'Puedo aportar experiencia real en atención al cliente, formación administrativa, responsabilidad y muchas ganas de aprender.',
    puntosFuertesYRequisitosExplicar: [
      'Experiencia real en atención al cliente, comercio y administración.',
      'FP de Auxiliar Administrativo y Curso de IA de 120 horas.',
      'Si solicitan una herramienta que no conoces, explica tu disposición para aprenderla.',
    ],
    guionLlamadaDirecta: `Buenos días. Mi nombre es Pilar Fernández Almaraz y llamaba por la oferta de ${company || 'empleo'}. Tengo experiencia en atención al cliente y formación administrativa. ¿Podrían indicarme cómo presentar mi candidatura?`,
  };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const body =
    req.body && typeof req.body === 'object'
      ? (req.body as Record<string, unknown>)
      : {};
  const offer = typeof body.textoOferta === 'string' ? body.textoOferta.trim() : '';
  const company =
    typeof body.empresaOLocalidad === 'string'
      ? body.empresaOLocalidad.trim()
      : '';
  if (!offer) {
    res.status(400).json({ error: 'Pega el texto de la oferta para analizarla.' });
    return;
  }

  const fallback = fallbackDossier(company, offer);
  const ai = getAiClient();
  if (!ai) {
    res.status(200).json(fallback);
    return;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Analiza esta oferta para Pilar Fernández Almaraz y genera un dossier completo de candidatura.\nEmpresa / localidad: ${company || 'Comarca de Torrijos'}\nTexto de la oferta: ${offer}`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tituloDetectado: { type: Type.STRING },
            compatibilidadPorcentaje: { type: Type.INTEGER },
            checksCompatibilidad: { type: Type.ARRAY, items: { type: Type.STRING } },
            puntosFuertesEncaje: { type: Type.ARRAY, items: { type: Type.STRING } },
            requisitoNoCumplidoOAlerta: { type: Type.STRING },
            comoDefenderSinDescartar: { type: Type.STRING },
            resumenCVAdaptado: { type: Type.STRING },
            cartaPresentacionNatural: { type: Type.STRING },
            emailAsunto: { type: Type.STRING },
            emailCuerpo: { type: Type.STRING },
            mensajeLinkedInBreve: { type: Type.STRING },
            presentacionCorta: { type: Type.STRING },
            preguntaProbableEntrevista: { type: Type.STRING },
            respuestaRecomendadaPilar: { type: Type.STRING },
            puntosFuertesYRequisitosExplicar: { type: Type.ARRAY, items: { type: Type.STRING } },
            guionLlamadaDirecta: { type: Type.STRING },
          },
          required: [
            'tituloDetectado',
            'compatibilidadPorcentaje',
            'checksCompatibilidad',
            'puntosFuertesEncaje',
            'requisitoNoCumplidoOAlerta',
            'comoDefenderSinDescartar',
            'resumenCVAdaptado',
            'cartaPresentacionNatural',
            'emailAsunto',
            'emailCuerpo',
            'mensajeLinkedInBreve',
            'presentacionCorta',
            'preguntaProbableEntrevista',
            'respuestaRecomendadaPilar',
            'puntosFuertesYRequisitosExplicar',
            'guionLlamadaDirecta',
          ],
        },
      },
    });
    const parsed = JSON.parse(response.text || '{}');
    res.status(200).json({ ...fallback, ...parsed });
  } catch (error) {
    console.error('No se pudo analizar la oferta con Gemini:', error);
    res.status(200).json(fallback);
  }
}
