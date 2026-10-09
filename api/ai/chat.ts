import { GoogleGenAI } from '@google/genai';

type ApiRequest = { method?: string; body?: unknown };
type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (data: unknown) => void;
};

const SYSTEM_INSTRUCTION = `Eres Pilar IA, una orientadora laboral cercana y útil para Pilar Fernández Almaraz, residente en Santo Domingo-Caudilla (Toledo). Basa tus respuestas exclusivamente en estos datos: permiso de conducir y coche propio; experiencia en atención al cliente, comercio, caja, reposición, administración, taxi, ayuda a domicilio y fabricación de calzado; FP de Auxiliar Administrativo; Curso de Inteligencia Artificial de 120 horas certificado por la Cámara de Comercio de Torrijos; mecanografía, Contaplus, Windows y Word; español nativo e inglés A2. Responde en español de España, con honestidad y sin descartar automáticamente una oferta.`;

function fallbackReply(message: string, day: number): string {
  const lower = message.toLowerCase();
  if (lower.includes('coche') || lower.includes('torrijos') || lower.includes('alcabón') || lower.includes('alcabon')) {
    return '¡Buenos días, Pilar! Tu coche propio y tu residencia en Santo Domingo-Caudilla son una ventaja para optar a puestos en Torrijos, Alcabón, Novés y alrededores. Destaca también tu experiencia atendiendo a personas y tu disponibilidad.';
  }
  if (lower.includes('entrevista') || lower.includes('inglés') || lower.includes('ingles')) {
    return '¡Buenos días, Pilar! Sé sincera sobre tu nivel de inglés A2 y céntrate en tus puntos fuertes: experiencia con clientes, FP de Auxiliar Administrativo, coche propio y ganas de aprender.';
  }
  return `¡Buenos días, Pilar! Vamos a ver qué podemos hacer hoy en el día ${day} de tu plan. Puedes preparar tu candidatura desde cualquiera de las ofertas y adaptar el CV y la presentación a cada puesto.`;
}

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({ apiKey });
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
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const day = typeof body.diaActual === 'number' ? body.diaActual : 1;
  if (!message) {
    res.status(400).json({ error: 'Por favor, escribe tu consulta.' });
    return;
  }

  const fallback = fallbackReply(message, day);
  const ai = getAiClient();
  if (!ai) {
    res.status(200).json({ reply: fallback });
    return;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Pilar está en el día ${day} de su plan de empleo. Consulta: "${message}"`,
      config: { systemInstruction: SYSTEM_INSTRUCTION, temperature: 0.4 },
    });
    res.status(200).json({ reply: response.text || fallback });
  } catch (error) {
    console.error('No se pudo generar la respuesta de Gemini:', error);
    res.status(200).json({ reply: fallback });
  }
}
