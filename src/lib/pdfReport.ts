import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { Transaction } from '../types';
import { Timestamp } from 'firebase/firestore';

export function generateMonthlyPDF(monthName: string, transactions: Transaction[]) {
  const doc = new jsPDF();
  const now = new Date();

  // Header
  doc.setFontSize(22);
  doc.setTextColor(24, 24, 27); // zinc-900
  doc.text('Relatório Financeiro - FINAI', 14, 22);
  
  doc.setFontSize(12);
  doc.setTextColor(113, 113, 122); // zinc-500
  doc.text(`Mês Referência: ${monthName}`, 14, 30);
  doc.text(`Gerado em: ${format(now, 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 14, 36);

  // Summary
  const income = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  const expense = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);
  const balance = income - expense;

  doc.setFontSize(14);
  doc.setTextColor(24, 24, 27); // zinc-900
  doc.text('Resumo do Mês', 14, 50);

  autoTable(doc, {
    startY: 55,
    head: [['Descrição', 'Valor (R$)']],
    body: [
      ['Total Entradas', income.toLocaleString('pt-BR', { minimumFractionDigits: 2 })],
      ['Total Saídas', expense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })],
      ['Saldo Final', balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })],
    ],
    theme: 'plain',
    headStyles: { fillColor: [244, 244, 245], textColor: [24, 24, 27] },
    columnStyles: {
      1: { halign: 'right' }
    }
  });

  // Detailed Transactions
  doc.setFontSize(14);
  doc.text('Detalhes das Transações', 14, (doc as any).lastAutoTable.finalY + 15);

  const tableData = transactions
    .sort((a, b) => {
      const dateA = a.date instanceof Timestamp ? a.date.toDate() : a.date;
      const dateB = b.date instanceof Timestamp ? b.date.toDate() : b.date;
      return dateB.getTime() - dateA.getTime();
    })
    .map(t => {
      const date = t.date instanceof Timestamp ? t.date.toDate() : t.date;
      return [
        format(date, 'dd/MM/yyyy', { locale: ptBR }),
        t.description,
        t.category,
        t.type === 'income' ? 'Entrada' : 'Saída',
        t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      ];
    });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 20,
    head: [['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor (R$)']],
    body: tableData,
    headStyles: { fillColor: [24, 24, 27], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      4: { halign: 'right' }
    }
  });

  // Footer text
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(10);
    doc.setTextColor(161, 161, 170); // zinc-400
    doc.text(
      `Página ${i} de ${pageCount}`,
      doc.internal.pageSize.width / 2,
      doc.internal.pageSize.height - 10,
      { align: 'center' }
    );
  }

  doc.save(`FINAI_Relatorio_${monthName.replace(' ', '_')}.pdf`);
}
