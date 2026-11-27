import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ValidationReport } from '../src/types/validation.ts';
import { validateRequirementsDocument } from '../src/server/validator.ts';
import { generatePdfReportBuffer } from '../src/server/pdfFormatter.ts';

export interface CliOptions {
  inputPath: string;
  outputPath: string;
  model?: string;
  chunkSize?: number;
}

export function parseCliArgs(argv: string[]): CliOptions {
  let inputPath = '';
  let outputPath = '';
  let model: string | undefined;
  let chunkSize: number | undefined;
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--input' || arg === '-i') {
      inputPath = argv[++i] ?? '';
    } else if (arg === '--output' || arg === '-o') {
      outputPath = argv[++i] ?? '';
    } else if (arg === '--model' || arg === '-m') {
      model = argv[++i];
    } else if (arg === '--chunk-size') {
      const val = Number(argv[++i]);
      if (!Number.isFinite(val) || val < 2000) {
        throw new Error('--chunk-size должен быть числом не меньше 2000.');
      }
      chunkSize = val;
    } else if (arg === '--help' || arg === '-h') {
      throw new Error('HELP');
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    } else {
      throw new Error(`Неизвестный аргумент: ${arg}`);
    }
  }

  if (!inputPath && positional[0]) inputPath = positional[0];
  if (!outputPath && positional[1]) outputPath = positional[1];

  if (!inputPath || !outputPath) {
    throw new Error(
      'Необходимо указать --input <путь_к_документу> и --output <путь_к_отчёту>.'
    );
  }

  return { inputPath, outputPath, model, chunkSize };
}

function printUsage(): void {
  console.log(
    `Использование:
  npm run analyze -- --input <путь-к-документу> --output <путь-к-отчёту>

Примеры:
  npm run analyze -- --input docs/requirements.md --output output/report.pdf
  npm run analyze -- --input docs/requirements.md --output output/report.md
  npm run analyze -- --input spec.pdf --output output/report.json

Опции:
  -i, --input <path>       Путь к входному документу (.md, .txt, .pdf)
  -o, --output <path>      Путь к файлу отчёта (.pdf, .md, .json)
  -m, --model <name>       Модель Gemini (по умолчанию из GEMINI_MODEL или gemini-3.5-flash-lite)
      --chunk-size <n>     Размер чанка в символах (по умолчанию 25000)
  -h, --help               Показать справку`
  );
}

export async function writeReportOutputs(
  report: ValidationReport,
  outputPath: string
): Promise<string[]> {
  const resolvedOutput = path.resolve(process.cwd(), outputPath);
  await fs.mkdir(path.dirname(resolvedOutput), { recursive: true });
  const lowerOutput = resolvedOutput.toLowerCase();
  const savedPaths: string[] = [];

  if (lowerOutput.endsWith('.pdf')) {
    const pdfBuffer = await generatePdfReportBuffer(report);
    await fs.writeFile(resolvedOutput, pdfBuffer);
    savedPaths.push(resolvedOutput);

    const baseWithoutExt = resolvedOutput.slice(0, -4);
    const mdPath = `${baseWithoutExt}.md`;
    const jsonPath = `${baseWithoutExt}.json`;
    await fs.writeFile(mdPath, report.markdownReport, 'utf-8');
    await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
    savedPaths.push(mdPath, jsonPath);
  } else if (lowerOutput.endsWith('.json')) {
    await fs.writeFile(
      resolvedOutput,
      JSON.stringify(report, null, 2),
      'utf-8'
    );
    savedPaths.push(resolvedOutput);
  } else {
    await fs.writeFile(resolvedOutput, report.markdownReport, 'utf-8');
    savedPaths.push(resolvedOutput);
  }

  return savedPaths;
}

async function runCli(): Promise<void> {
  let options: CliOptions;
  try {
    options = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof Error && err.message === 'HELP') {
      printUsage();
      process.exit(0);
    }
    console.error(
      `Ошибка аргументов: ${err instanceof Error ? err.message : String(err)}`
    );
    printUsage();
    process.exit(1);
  }

  const resolvedInput = path.resolve(process.cwd(), options.inputPath);

  try {
    await fs.access(resolvedInput);
  } catch {
    console.error(`Ошибка: входной файл не найден: ${resolvedInput}`);
    process.exit(1);
  }

  const lowerInput = resolvedInput.toLowerCase();
  const isPdfInput = lowerInput.endsWith('.pdf');
  const sourceFormat = isPdfInput
    ? 'pdf'
    : lowerInput.endsWith('.txt')
      ? 'text'
      : 'markdown';

  console.log(`Анализ документа: ${options.inputPath} (${sourceFormat})...`);

  const report = await validateRequirementsDocument({
    documentName: options.inputPath,
    sourceFormat,
    pdfBuffer: isPdfInput ? await fs.readFile(resolvedInput) : undefined,
    textContent: !isPdfInput
      ? await fs.readFile(resolvedInput, 'utf-8')
      : undefined,
    modelOverride: options.model,
    maxCharsPerChunk: options.chunkSize,
  });

  const savedPaths = await writeReportOutputs(report, options.outputPath);

  for (const saved of savedPaths) {
    console.log(`Отчёт сохранён: ${path.relative(process.cwd(), saved)}`);
  }
  console.log(
    `Требований: ${report.summary.totalRequirements} | Находок: ${report.summary.totalFindings} (Critical: ${report.summary.severityCounts.Critical}, High: ${report.summary.severityCounts.High}, Medium: ${report.summary.severityCounts.Medium}, Low: ${report.summary.severityCounts.Low})`
  );
  console.log(`Итог: ${report.verdict.decisionLabel}`);
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(new URL(import.meta.url).pathname);

if (isDirectExecution) {
  runCli().catch((err) => {
    console.error(
      `Ошибка выполнения анализа: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  });
}
