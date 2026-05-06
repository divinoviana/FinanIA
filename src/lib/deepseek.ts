
export interface TransactionParsingResult {
  description?: string;
  amount?: number;
  type?: "income" | "expense";
  category?: string;
  dateOffsetDays?: number;
  expenseType?: "fixed" | "flexible" | "random";
}

const API_KEY = (import.meta as any).env.VITE_API_KEY || process.env.API_KEY || "";
const BASE_URL = "https://api.deepseek.com/v1";

export async function parseTransactionWithDeepSeek(text: string, fileData?: string, mimeType?: string): Promise<TransactionParsingResult> {
  if (!API_KEY || API_KEY === "MY_API_KEY") {
    throw new Error("API_KEY do DeepSeek não configurada. Por favor, adicione a variável API_KEY nas configurações do Vercel.");
  }

  const systemPrompt = `Você é um especialista em lançamentos financeiros. 
Extraia os seguintes campos em JSON:
1. description: Descrição clara.
2. amount: Valor numérico (apenas número).
3. type: 'income' (ganho) ou 'expense' (gasto).
4. category: Uma palavra (ex: Mercado, Aluguel, Salário, Lazer).
5. dateOffsetDays: 0 para hoje, -1 para ontem.
6. expenseType: 'fixed', 'flexible' ou 'random'.

Responda APENAS o JSON.`;

  const userPrompt = fileData 
    ? `Analise este documento financeiro (MimeType: ${mimeType}). Conteúdo em Base64 (resumo se necessário). Instrução do usuário: ${text}`
    : `Entrada do usuário: ${text}`;

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || "Erro na API do DeepSeek");
    }

    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  } catch (error) {
    console.error("DeepSeek Error:", error);
    throw error;
  }
}
