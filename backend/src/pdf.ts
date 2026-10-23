import PDFDocument from 'pdfkit';
import type { Report } from './ai.js';

interface PdfInput {
  report: Report;
  doctorName: string;
  crm: string;
  crmUf: string;
  consultationDate: number;
}

const MARGIN = 56;

/** Ordem do documento: paciente -> problemas -> medicamentos -> sugestões -> assinatura do médico. */
export function buildPdf({ report, doctorName, crm, crmUf, consultationDate }: PdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, info: { Title: 'Relatório de consulta' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const date = new Date(consultationDate).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const width = doc.page.width - MARGIN * 2;

    const heading = (text: string) => {
      doc.moveDown(1).font('Helvetica-Bold').fontSize(13).fillColor('#0f3d5e').text(text);
      doc.moveTo(MARGIN, doc.y + 2).lineTo(MARGIN + width, doc.y + 2).strokeColor('#c9d6df').lineWidth(0.8).stroke();
      doc.moveDown(0.5).font('Helvetica').fontSize(11).fillColor('#111111');
    };
    const bullets = (items: string[], empty: string) => {
      if (!items.length) return void doc.fillColor('#666666').text(empty).fillColor('#111111');
      items.forEach((t) => doc.text(`•  ${t}`, { indent: 6, paragraphGap: 3 }));
    };

    doc.font('Helvetica-Bold').fontSize(18).fillColor('#0f3d5e').text('Relatório de Consulta');
    doc.font('Helvetica').fontSize(10).fillColor('#555555').text(`Data da consulta: ${date}`);

    heading('Paciente');
    doc.text(report.paciente);

    heading('Lista de problemas');
    bullets(report.problemas, 'Nenhum problema identificado na consulta.');

    heading('Medicamentos em uso');
    bullets(
      report.medicamentos.map((m) => `${m.nome} — ${m.posologia || 'não informada'}`),
      'Nenhum medicamento em uso foi citado.',
    );

    heading('Sugestões e dicas');
    bullets(report.sugestoes, 'Sem sugestões adicionais para esta consulta.');
    doc.moveDown(0.5).font('Helvetica-Oblique').fontSize(9).fillColor('#666666').text(
      'Sugestões geradas por inteligência artificial a partir do conteúdo da consulta, como apoio. Exigem avaliação e validação do médico responsável.',
    );

    // Assinatura sempre no final, sem quebrar entre páginas
    if (doc.y > doc.page.height - MARGIN - 110) doc.addPage();
    const y = Math.max(doc.y + 60, doc.page.height - MARGIN - 90);
    const lineW = 260;
    const x = MARGIN + (width - lineW) / 2;
    doc.moveTo(x, y).lineTo(x + lineW, y).strokeColor('#111111').lineWidth(0.8).stroke();
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111111').text(`Dr(a). ${doctorName}`, MARGIN, y + 6, { width, align: 'center' });
    doc.font('Helvetica').fontSize(10).fillColor('#444444').text(`CRM ${crm}/${crmUf}`, { width, align: 'center' });

    doc.end();
  });
}
