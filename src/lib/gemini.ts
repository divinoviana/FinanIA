import { GoogleGenAI, Type } from "@google/genai";
import { Transaction } from "@/src/types";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const PARSE_TRANSACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    description: { type: Type.STRING, description: "Breve descrição do gasto ou ganho" },
    amount: { type: Type.NUMBER, description: "O valor numérico da transação" },
    type: { type: Type.STRING, enum: ["income", "expense"], description: "income se for dinheiro entrando, expense se for dinheiro saindo" },
    category: { type: Type.STRING, description: "Categoria em uma palavra (ex: Alimentação, Lazer, Salário, Casa)" },
    dateOffsetDays: { type: Type.NUMBER, description: "Offset de dias relativo a hoje. 0 para hoje, -1 para ontem, etc." },
    expenseType: { type: Type.STRING, enum: ["fixed", "flexible", "random"], description: "Classificação da despesa" }
  },
  required: ["description", "amount", "type", "category"]
};

export async function parseTransaction(text: string): Promise<Partial<Transaction> & { dateOffsetDays?: number }> {
  try {
    const now = new Date();
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp", // Using flash for speed
      contents: [
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
      ],
      config: {
        systemInstruction: "Você é um especialista em lançamentos financeiros. Extraia dados estruturados e precisos.",
        responseMimeType: "application/json",
        responseSchema: PARSE_TRANSACTION_SCHEMA
      }
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Gemini Parse Error:", error);
    throw error;
  }
}

export async function parseTransactionWithFile(fileData: string, mimeType: string, text: string = ""): Promise<Partial<Transaction> & { dateOffsetDays?: number }> {
  try {
    const now = new Date();
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: [
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
      ],
      config: {
        systemInstruction: "Você é um especialista em analisar documentos financeiros (PDF/Imagens). Extraia valor, descrição, categoria e tipo.",
        responseMimeType: "application/json",
        responseSchema: PARSE_TRANSACTION_SCHEMA
      }
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Gemini Multi-modal Error:", error);
    throw error;
  }
}
