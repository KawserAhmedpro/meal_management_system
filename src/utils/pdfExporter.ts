import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SystemSettings } from '../types';

export function exportTableToPdf(
  title: string,
  headers: string[],
  rows: (string | number)[][],
  settings: SystemSettings,
  month: string,
  extraSummary?: { label: string; value: string }[]
) {
  const doc = new jsPDF('p', 'pt', 'a4');

  // Header Title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(settings.institutionName || 'Mymensingh Engineering College', 40, 40);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`${settings.hallName || 'Omar Ekushe Hall'} — ${settings.messName || 'Mess Management'}`, 40, 56);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(title.toUpperCase(), 40, 78);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Month: ${month}   |   Generated: ${new Date().toLocaleDateString('en-GB')}`, 40, 92);

  // Extra summary badges/boxes if provided
  let startY = 105;
  if (extraSummary && extraSummary.length > 0) {
    const summaryText = extraSummary.map((s) => `${s.label}: ${s.value}`).join('   |   ');
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(40, startY, 515, 22, 4, 4, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(summaryText, 50, startY + 14);
    startY += 30;
  }

  // AutoTable
  autoTable(doc, {
    head: [headers],
    body: rows,
    startY,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'left',
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 40, right: 40 },
    didDrawPage: (data) => {
      // Footer page numbers
      const str = `Page ${doc.getNumberOfPages()}`;
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(str, data.settings.margin.left, doc.internal.pageSize.height - 20);
    },
  });

  // Save the generated PDF
  const sanitizedTitle = title.replace(/\s+/g, '_');
  doc.save(`${sanitizedTitle}_${month}.pdf`);
}
