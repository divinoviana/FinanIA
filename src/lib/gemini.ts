import { GoogleGenAI, Type } from "@google/genai";
import { Transaction } from "@/src/types";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (aiInstance) return aiInstance;
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("Gemini API Key não configurada. Por favor, adicione a variável GEMINI_API_KEY ou Gemini_API_Key nas configurações.");
  }
  aiInstance = new GoogleGenAI(key);
  return aiInstance;
}

const PARSE_TRANSACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    description: { type: Type.STRING, description: "Breve descrição do gasto ou ganho" },
    amount: { type: Type.NUMBER, description: "O valor numérico da transação" },
    type: { type: Type.STRING, enum: ["income", "expense"], description: "income se for dinheiro entrando, expense se for dinheiro saindo" },
    category: { type: Type.STRING, description: "Categoria em uma palavra (ex: Mercado, Aluguel, Salário, Lazer)" },
    dateOffsetDays: { type: Type.NUMBER, description: "Offset de dias relativo a hoje. 0 para hoje, -1 para ontem, etc." },
    expenseType: { type: Type.STRING, enum: ["fixed", "flexible", "random"], description: "Classificação da despesa" }
  },
  required: ["description", "amount", "type", "category"]
};

export async function parseTransaction(text: string): Promise<Partial<Transaction> & { dateOffsetDays?: number }> {
  try {
    const ai = getAI();
    const now = new Date();
    const model = ai.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      systemInstruction: "Você é um especialista em lançamentos financeiros. Extraia dados estruturados e precisos.",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: PARSE_TRANSACTION_SCHEMA
      }
    });

    const result = await model.generateContent([
      {
        text: `Contexto Temporal: Hoje é ${format(now, 'EEEE, dd/MM/yyyy', { locale: ptBR })}.
        
        Entrada do Usuário: "${text}"
        
        Extraia os detalhes:
        1. Descrição clara do item.
        2. Valor (exclua moedas, retorne apenas número).
        3. Tipo: 'income' (ganho/recebimento) ou 'expense' (gasto/pagamento).
        4. Categoria: uma palavra (ex: Mercado, Aluguel, Salário, Lazer).
        5. dateOffsetDays: 
           - Se disse 'ontem': -1
           - Se disse 'anteontem': -2
           - Se não disse nada de data: 0
        6. expenseType: fixed (contas fixas), flexible (variáveis), random (extras).`
      }
    ]);

    const response = await result.response;
    const json = JSON.parse(response.text() || '{}');
    console.log("Gemini Parse Success:", json);
    return json;
  } catch (error) {
    console.error("Gemini Parse Error:", error);
    throw error;
  }
}

export async function parseTransactionWithFile(fileData: string, mimeType: string, text: string = ""): Promise<Partial<Transaction> & { dateOffsetDays?: number }> {
  try {
    const ai = getAI();
    const now = new Date();
    const model = ai.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      systemInstruction: "Você é um especialista em analisar documentos financeiros (PDF/Imagens). Extraia valor, descrição, categoria e tipo.",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: PARSE_TRANSACTION_SCHEMA
      }
    });

    const result = await model.generateContent([
      {
        inlineData: {
          data: fileData,
          mimeType: mimeType
        }
      },
      {
        text: `Analise o arquivo anexo (pode ser um comprovante, nota fiscal ou boleto).
        
        Instrução Adicional do Usuário: "${text}"
        Hoje é ${format(now, 'EEEE, dd/MM/yyyy', { locale: ptBR })}.
        
        Extraia os dados estruturados do lançamento financeiro encontrado no arquivo. 
        Se o usuário especificou um mês ou data na instrução adicional, tente respeitar. 
        Caso contrário, use a data encontrada no documento ou a data de hoje.`
      }
    ]);

    const response = await result.response;
    const json = JSON.parse(response.text() || '{}');
    console.log("Gemini File Parse Success:", json);
    return json;
  } catch (error) {
    console.error("Gemini Multi-modal Error:", error);
    throw error;
  }
}
