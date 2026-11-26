import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { validateRequirementsDocument } from './src/server/validator.ts';
import { generatePdfReportBuffer } from './src/server/pdfFormatter.ts';
import type { ValidationReport } from './src/types/validation.ts';

const PORT = 3000;
const HOST = '0.0.0.0';
const DEFAULT_DOC_PATH = path.resolve(process.cwd(), 'docs/requirements.md');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB
  },
});

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/default-document', async (_req, res) => {
    try {
      const content = await fs.readFile(DEFAULT_DOC_PATH, 'utf-8');
      const firstHeading = content
        .split(/\r?\n/)
        .find((line) => line.startsWith('# '));
      const title = firstHeading
        ? firstHeading.replace(/^#\s+/, '').trim()
        : 'docs/requirements.md';
      const stat = await fs.stat(DEFAULT_DOC_PATH);

      res.json({
        filename: 'docs/requirements.md',
        title,
        content,
        sizeBytes: stat.size,
        lineCount: content.split(/\r?\n/).length,
      });
    } catch (err) {
      res.status(404).json({
        error:
          err instanceof Error
            ? `Не удалось прочитать docs/requirements.md: ${err.message}`
            : 'Файл docs/requirements.md не найден.',
      });
    }
  });

  app.post('/api/validate', upload.single('file'), async (req, res) => {
    try {
      let documentName = 'requirements.md';
      let sourceFormat: 'markdown' | 'text' | 'pdf' = 'markdown';
      let textContent: string | undefined;
      let pdfBuffer: Buffer | undefined;

      if (req.file) {
        documentName = req.file.originalname || 'uploaded-document';
        const lower = documentName.toLowerCase();
        if (lower.endsWith('.pdf') || req.file.mimetype === 'application/pdf') {
          sourceFormat = 'pdf';
          pdfBuffer = req.file.buffer;
        } else {
          sourceFormat = lower.endsWith('.md') ? 'markdown' : 'text';
          textContent = req.file.buffer.toString('utf-8');
        }
      } else {
        const body = req.body as {
          documentName?: string;
          content?: string;
          useDefault?: boolean;
        };

        if (body.useDefault) {
          documentName = 'docs/requirements.md';
          sourceFormat = 'markdown';
          textContent = await fs.readFile(DEFAULT_DOC_PATH, 'utf-8');
        } else if (typeof body.content === 'string' && body.content.trim()) {
          documentName = body.documentName?.trim() || 'custom-requirements.md';
          sourceFormat = documentName.toLowerCase().endsWith('.txt')
            ? 'text'
            : 'markdown';
          textContent = body.content;
        } else {
          res.status(400).json({
            error:
              'Передайте файл требований (.md, .txt, .pdf) или текст документа.',
          });
          return;
        }
      }

      if (sourceFormat !== 'pdf' && (!textContent || !textContent.trim())) {
        res.status(400).json({ error: 'Документ с требованиями пуст.' });
        return;
      }

      const report = await validateRequirementsDocument({
        documentName,
        sourceFormat,
        textContent,
        pdfBuffer,
      });

      res.json(report);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Внутренняя ошибка проверки.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/report/pdf', async (req, res) => {
    try {
      const report = req.body as ValidationReport;
      if (!report || !report.passport || !report.verdict) {
        res.status(400).json({ error: 'Некорректные данные отчёта для PDF.' });
        return;
      }
      const pdfBuffer = await generatePdfReportBuffer(report);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="validation-report.pdf"'
      );
      res.send(pdfBuffer);
    } catch (err) {
      res.status(500).json({
        error:
          err instanceof Error
            ? `Не удалось сформировать PDF: ${err.message}`
            : 'Ошибка генерации PDF.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Server listening on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
