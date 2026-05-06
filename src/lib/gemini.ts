import { GoogleGenAI, Type } from "@google/genai";
import { Transaction } from "@/src/types";

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
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Extraia os detalhes do lançamento financeiro: "${text}". 
      Tente identificar se é um gasto (expense) ou ganho (income). 
      Extraia o valor numérico.
      Se o usuário mencionar 'ontem' coloque dateOffsetDays: -1. Se não mencionar nada relativo a data, use 0.`,
      config: {
        systemInstruction: "Você é um assistente financeiro que extrai dados estruturados de frases simples.",
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
