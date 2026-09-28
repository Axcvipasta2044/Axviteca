const Busboy = require('busboy');

function escapePdfText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function normalizeText(raw) {
  return String(raw || '')
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function splitParagraphs(text) {
  const cleaned = normalizeText(text);
  if (!cleaned) return ['Documento vacio.'];
  return cleaned
    .split(/\n{2,}/)
    .map((block) => block.split('\n').map((line) => line.trim()).filter(Boolean).join(' '))
    .filter(Boolean);
}

function textToPdfBuffer(text) {
  const paragraphs = splitParagraphs(text);
  const lines = [];

  paragraphs.forEach((paragraph) => {
    const words = paragraph.split(/\s+/);
    let current = '';
    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > 90) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    });
    if (current) lines.push(current);
    lines.push('');
  });

  const pageHeight = 792;
  const startY = 750;
  const lineHeight = 16;
  const pages = [];
  let currentPage = [];
  let currentY = startY;

  lines.forEach((line) => {
    if (currentY < 60) {
      pages.push(currentPage);
      currentPage = [];
      currentY = startY;
    }
    currentPage.push({ text: line, y: currentY });
    currentY -= lineHeight;
  });

  if (!currentPage.length) {
    currentPage.push({ text: 'Documento vacio.', y: startY });
  }
  pages.push(currentPage);

  const objects = [];
  const pageObjectIds = [];

  pages.forEach((pageLines) => {
    const contentStream = [
      'BT',
      '/F1 11 Tf',
      ...pageLines.map(({ text, y }) => `1 0 0 1 50 ${y} Tm (${escapePdfText(text)}) Tj`),
      'ET',
    ].join('\n');

    const contentId = objects.length + 4;
    const pageId = contentId + 1;
    objects.push(`<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}\nendstream`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageObjectIds.push(pageId);
  });

  const pdfObjects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...objects,
  ];

  let output = '%PDF-1.4\n';
  const offsets = [0];

  pdfObjects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output, 'utf8'));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefStart = Buffer.byteLength(output, 'utf8');
  output += `xref\n0 ${pdfObjects.length + 1}\n`;
  output += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    output += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  output += `trailer\n<< /Size ${pdfObjects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(output, 'utf8');
}

function rtfToText(buffer) {
  return buffer
    .toString('latin1')
    .replace(/\\par[d]?/gi, '\n')
    .replace(/\\tab/gi, '\t')
    .replace(/\\'[0-9a-fA-F]{2}/g, '')
    .replace(/\\u-?\d+\??/g, '')
    .replace(/\\[a-z]+\d* ?/gi, ' ')
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n');
}

function getFileExtension(filename) {
  const match = String(filename || '').toLowerCase().match(/(\.[^.]+)$/);
  return match ? match[1] : '';
}

function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const contentType = event.headers['content-type'] || event.headers['Content-Type'];
    if (!contentType || !contentType.startsWith('multipart/form-data')) {
      reject(new Error('Expected multipart/form-data'));
      return;
    }

    const bb = Busboy({ headers: { 'content-type': contentType } });
    let uploadedFile = null;

    bb.on('file', (fieldname, file, info) => {
      const chunks = [];
      file.on('data', (chunk) => chunks.push(chunk));
      file.on('end', () => {
        uploadedFile = {
          filename: info && typeof info === 'object' ? info.filename : 'document',
          mimeType: info && typeof info === 'object' ? info.mimeType : 'application/octet-stream',
          buffer: Buffer.concat(chunks),
        };
      });
    });

    bb.on('finish', () => resolve(uploadedFile));
    bb.on('error', reject);

    const body = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
    bb.end(body);
  });
}

function pdfResponse(filename, buffer) {
  return {
    statusCode: 200,
    isBase64Encoded: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
    body: buffer.toString('base64'),
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  try {
    const uploadedFile = await parseMultipart(event);
    if (!uploadedFile || !uploadedFile.buffer || !uploadedFile.buffer.length) {
      return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'No file uploaded' };
    }

    const extension = getFileExtension(uploadedFile.filename);
    const outputName = `${String(uploadedFile.filename || 'document').replace(/\.[^.]+$/, '') || 'document'}.pdf`;

    if (extension === '.pdf') {
      return pdfResponse(outputName, uploadedFile.buffer);
    }

    if (extension === '.txt') {
      let text = '';
      try {
        text = uploadedFile.buffer.toString('utf8');
      } catch (error) {
        text = uploadedFile.buffer.toString('latin1');
      }
      return pdfResponse(outputName, textToPdfBuffer(text));
    }

    if (extension === '.rtf') {
      return pdfResponse(outputName, textToPdfBuffer(rtfToText(uploadedFile.buffer)));
    }

    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: 'Formato no soportado en Netlify. Usa PDF, TXT o RTF.',
    };
  } catch (error) {
    console.error('convert function error', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: error.message || 'Error al convertir el archivo.',
    };
  }
};
