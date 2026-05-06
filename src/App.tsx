import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Send,
  Sparkles,
  Trash2,
  ChevronRight,
  ChevronDown,
  Paperclip,
  FileText,
  X
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  Timestamp, 
  orderBy, 
  deleteDoc,
  doc,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth, signIn, signOut, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { Transaction } from '@/src/types';
import { parseTransaction, parseTransactionWithFile } from '@/src/lib/gemini';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toaster, toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { format, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedMonths, setExpandedMonths] = useState<string[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', user.uid),
      orderBy('date', 'desc')
    );
    return onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      setTransactions(txs);
      
      // Auto-expand current month on first load if not set
      const currentMonthKey = format(new Date(), 'yyyy-MM');
      setExpandedMonths(prev => prev.length === 0 ? [currentMonthKey] : prev);
    });
  }, [user]);

  const groupedByMonth = useMemo(() => {
    const groups: { [key: string]: { label: string, txs: Transaction[] } } = {};
    const year = new Date().getFullYear();
    
    // Create placeholders for all 12 months for the current year
    for (let m = 0; m < 12; m++) {
      const date = new Date(year, m, 1);
      const key = format(date, 'yyyy-MM');
      groups[key] = {
        label: format(date, 'MMMM yyyy', { locale: ptBR }),
        txs: []
      };
    }

    transactions.forEach(tx => {
      const date = tx.date instanceof Timestamp ? tx.date.toDate() : new Date(tx.date);
      const key = format(date, 'yyyy-MM');
      
      // If transaction is from another year, add it dynamically
      if (!groups[key]) {
        groups[key] = {
          label: format(date, 'MMMM yyyy', { locale: ptBR }),
          txs: []
        };
      }
      groups[key].txs.push(tx);
    });

    // Sort keys descending
    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .reduce((obj, key) => {
        // Only show months that have transactions OR are in the current year
        const isCurrentYear = key.startsWith(year.toString());
        if (groups[key].txs.length > 0 || isCurrentYear) {
          obj[key] = groups[key];
        }
        return obj;
      }, {} as { [key: string]: { label: string, txs: Transaction[] } });
  }, [transactions]);

  const stats = useMemo(() => {
    const income = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
    const expenses = transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
    return { income, expenses, balance: income - expenses };
  }, [transactions]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!chatInput.trim() && !selectedFile) || !user || isProcessing) return;

    setIsProcessing(true);
    const text = chatInput;
    const file = selectedFile;
    setChatInput('');
    setSelectedFile(null);

    try {
      let parsed;
      if (file) {
        toast.info("Analisando arquivo com IA...");
        const base64 = await fileToBase64(file);
        parsed = await parseTransactionWithFile(base64, file.type, text);
      } else {
        parsed = await parseTransaction(text);
      }

      if (parsed.amount) {
        let finalDate = new Date();
        if (parsed.dateOffsetDays) {
          finalDate.setDate(finalDate.getDate() + parsed.dateOffsetDays);
        }

        await addDoc(collection(db, 'transactions'), {
          description: parsed.description,
          amount: parsed.amount,
          type: parsed.type,
          expenseType: parsed.expenseType || (parsed.type === 'expense' ? 'random' : 'none'),
          category: parsed.category,
          date: Timestamp.fromDate(finalDate),
          userId: user.uid
        });
        toast.success(`Registrado: ${parsed.description} - R$ ${parsed.amount.toLocaleString('pt-BR')}`);
      } else {
        toast.error("Não consegui interpretar o registro. Tente anexar uma imagem mais nítida ou digitar o valor.");
      }
    } catch (error) {
      console.error(error);
      const msg = error instanceof Error ? error.message : "Erro ao processar com IA.";
      toast.error(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const clearAllData = async () => {
    if (!user || !confirm("Tem certeza que deseja apagar TODOS os seus lançamentos? Esta ação não pode ser desfeita.")) return;
    
    try {
      const q = query(collection(db, 'transactions'), where('userId', '==', user.uid));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      snapshot.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      toast.success("Todos os dados foram removidos.");
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'transactions');
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-zinc-50 font-sans">Carregando...</div>;

  if (!user) return (
    <div className="h-screen flex flex-col items-center justify-center bg-zinc-50 p-6 font-sans">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm text-center space-y-8">
        <div className="inline-flex p-4 bg-emerald-500 rounded-3xl shadow-2xl shadow-emerald-200">
          <Wallet className="w-12 h-12 text-white" />
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-black tracking-tighter text-zinc-900">FINAI.</h1>
          <p className="text-zinc-500 font-medium">Controle financeiro simples por chat.</p>
        </div>
        <Button id="login-button" onClick={signIn} className="w-full h-16 text-lg font-bold bg-zinc-900 hover:bg-zinc-800 rounded-2xl shadow-xl transition-all hover:scale-[1.02]">
          Entrar com Google
        </Button>
      </motion.div>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans flex flex-col overflow-hidden">
      <Toaster position="top-center" richColors />
      
      <header className="p-6 md:p-8 flex items-center justify-between bg-white border-b border-zinc-100 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500 rounded-lg">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <span className="text-2xl font-black tracking-tighter">FINAI.</span>
        </div>
        <div className="flex items-center gap-4">
           <div className="hidden md:block text-right mr-2">
             <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Ambiente</p>
             <p className="text-xs font-bold text-zinc-900">Limpo & Organizado</p>
           </div>
           <Button id="clear-data" variant="outline" size="sm" onClick={clearAllData} title="Limpar Tudo" className="text-zinc-500 hover:text-red-500 hover:bg-red-50 border-zinc-200 rounded-xl px-3">
            <Trash2 className="w-4 h-4 mr-2" /> 
            <span className="hidden sm:inline">Resetar App</span>
          </Button>
          <div className="h-8 w-[1px] bg-zinc-100 mx-1" />
          <img src={user.photoURL || ''} alt="" className="w-10 h-10 rounded-full border-2 border-white shadow-md" />
          <Button id="sign-out" variant="ghost" className="hidden lg:flex text-zinc-500" onClick={signOut}>Sair</Button>
        </div>
      </header>

      <div className="px-6 py-4 bg-zinc-900 text-white shrink-0">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold mb-1">Saldo Total</p>
            <p className="text-2xl font-black">R$ {stats.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="flex gap-8 text-right">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Entradas</p>
              <p className="font-bold text-emerald-400">+{stats.income.toLocaleString('pt-BR')}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Saídas</p>
              <p className="font-bold text-red-400">-{stats.expenses.toLocaleString('pt-BR')}</p>
            </div>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-grow p-6">
        <div className="max-w-4xl mx-auto space-y-8 pb-32">
          {Object.keys(groupedByMonth).length === 0 && (
            <div className="text-center py-20 space-y-4">
              <div className="w-20 h-20 bg-zinc-100 rounded-full flex items-center justify-center mx-auto">
                <Sparkles className="w-10 h-10 text-zinc-300" />
              </div>
              <p className="text-zinc-400 font-medium italic">Nenhum lançamento registrado.<br/>Use a barra abaixo para começar.</p>
            </div>
          )}

          {(Object.entries(groupedByMonth) as [string, { label: string, txs: Transaction[] }][]).map(([monthKey, group]) => (
            <div key={monthKey} className="space-y-4">
              <button 
                onClick={() => setExpandedMonths(prev => 
                  prev.includes(monthKey) ? prev.filter(m => m !== monthKey) : [...prev, monthKey]
                )}
                className="flex items-center gap-3 w-full text-left group"
              >
                <h3 className="text-xl font-black tracking-tight capitalize group-hover:text-emerald-600 transition-colors">
                  {group.label}
                </h3>
                {group.txs.length > 0 && (
                  <span className="text-[10px] font-bold bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full">
                    {group.txs.length}
                  </span>
                )}
                <div className="h-[1px] flex-grow bg-zinc-200" />
                {expandedMonths.includes(monthKey) ? <ChevronDown className="w-5 h-5 text-zinc-300" /> : <ChevronRight className="w-5 h-5 text-zinc-300" />}
              </button>

              <AnimatePresence initial={false}>
                {expandedMonths.includes(monthKey) && (
                  <motion.div 
                    key={`content-${monthKey}`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-3 pt-2">
                      {group.txs.length === 0 ? (
                        <div className="py-4 px-6 border-2 border-dashed border-zinc-100 rounded-2xl text-center text-zinc-300 text-sm italic">
                          Sem lançamentos para este mês
                        </div>
                      ) : (
                        group.txs.map(tx => (
                          <TransactionRow key={tx.id} tx={tx} />
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="fixed bottom-0 left-0 w-full p-6 md:p-8 shrink-0 bg-transparent pointer-events-none">
        <div className="max-w-2xl mx-auto pointer-events-auto">
          <form onSubmit={handleChatSubmit} className="relative">
            <AnimatePresence>
              {selectedFile && (
                <motion.div 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 20, opacity: 0 }}
                  className="absolute -top-16 left-0 right-0 p-3 bg-white border border-zinc-100 rounded-2xl shadow-xl flex items-center justify-between mx-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-zinc-900 truncate max-w-[150px]">{selectedFile.name}</p>
                      <p className="text-[10px] text-zinc-400">Pronto para análise</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedFile(null)} className="h-8 w-8 text-zinc-400 hover:text-red-500 rounded-full">
                    <X className="w-4 h-4" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            <div className={`
              flex items-center bg-white border-2 border-zinc-200 rounded-3xl p-2 shadow-[0_20px_50px_rgba(0,0,0,0.1)] transition-all
              ${isProcessing ? 'border-emerald-500 scale-[1.02]' : 'focus-within:border-zinc-900'}
            `}>
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-3 text-zinc-400 hover:text-zinc-600 transition-colors"
                title="Anexar arquivo ou imagem"
              >
                <Paperclip className="w-6 h-6" />
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setSelectedFile(file);
                }}
                className="hidden" 
                accept="image/*,application/pdf"
              />
              <Input 
                id="chat-input"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={selectedFile ? "Adicione uma instrução (opcional)..." : "Diga o que gastou ou recebeu..."}
                className="border-none shadow-none focus-visible:ring-0 text-lg h-14 bg-transparent placeholder:text-zinc-300 font-medium"
                disabled={isProcessing}
              />
              <Button 
                id="send-chat"
                type="submit" 
                disabled={isProcessing || (!chatInput.trim() && !selectedFile)}
                className="h-14 w-14 rounded-2xl bg-zinc-900 text-white hover:bg-zinc-800 transition-all shrink-0"
              >
                {isProcessing ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Send className="w-6 h-6" />
                )}
              </Button>
            </div>
            {isProcessing && (
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-zinc-900 text-white text-[10px] font-bold px-4 py-2 rounded-full uppercase tracking-widest animate-bounce shadow-xl">
                A IA está processando...
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

const TransactionRow: React.FC<{ tx: Transaction }> = ({ tx }) => {
  const date = tx.date instanceof Timestamp ? tx.date.toDate() : new Date(tx.date);
  
  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, 'transactions', tx.id));
      toast.success("Lançamento removido");
    } catch (e) {
      toast.error("Erro ao remover");
    }
  };

  return (
    <motion.div 
      initial={{ x: -10, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="flex items-center justify-between p-4 bg-white rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md transition-all group"
    >
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-xl ${tx.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-zinc-50 text-zinc-600'}`}>
          {tx.type === 'income' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
        </div>
        <div>
          <p className="font-bold text-zinc-900">{tx.description}</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-tighter text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-full">{tx.category}</span>
            <span className="text-zinc-200 text-xs">•</span>
            <span className="text-[10px] font-medium text-zinc-400">{format(date, 'dd/MM, HH:mm')}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <p className={`text-lg font-black ${tx.type === 'income' ? 'text-emerald-600' : 'text-zinc-900'}`}>
          {tx.type === 'income' ? '+' : '-'} R$ {tx.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </p>
        <button id={`delete-${tx.id}`} onClick={handleDelete} className="p-2 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
