# AI Requirements Validator (`Агент проверки требований`)

ИИ-агент статической проверки спецификаций программных требований (включая финтех-документы) с поддержкой **Markdown**, **TXT** и **PDF**, чанкованием крупных документов, строгой валидацией структурированных ответов Gemini через JSON Schema + Zod и генерацией отчёта на русском языке в формате **PDF**, **Markdown** и **JSON**.

Исходное задание хакатона BCC-HUB x MNU FinTech Hackathon и проверяемый документ находятся в [`docs/requirements.md`](./docs/requirements.md).

---

## Возможности

1. **Обработка документов (`src/server/documentProcessor.ts`)**:
   - Чтение `.md`, `.txt` и `.pdf` (через `pdfjs-dist`).
   - Сохранение точных номеров строк и иерархии разделов (для Markdown/TXT) или номеров страниц (для PDF).
   - Секционное чанкование крупных документов (`chunkDocument`) без пропуска разделов и страниц.
2. **Извлечение и индивидуальный анализ требований (`src/server/validator.ts`)**:
   - Отделение реальных требований (`functional`, `non_functional`, `integration`, `data`, `ui`, `acceptance`, `constraint`) от заголовков, метаданных и описаний.
   - Присвоение стабильных уникальных ID (`REQ-001`, `REQ-002`, ...) с сохранением исходной формулировки и ссылки на источник.
   - Оценка каждого требования по 7 критериям (ISO/IEC/IEEE 29148:2018 п. 5.2.5): *однозначность, полнота, проверяемость и тестопригодность, осуществимость, необходимость, согласованность, корректность терминологии*.
3. **Анализ документа целиком и доказательные находки (`src/server/schemas.ts`)**:
   - Сквозная проверка по 7 направлениям (ISO/IEC/IEEE 29148:2018 п. 5.2.6 и IEEE Std 830-1998 п. 4.3): противоречия, пропущенные требования, дубликаты, несогласованная терминология, отсутствующие бизнес-сценарии, конфликты родительской и дочерней спецификаций, отсутствующие детали интеграции.
   - Каждая находка (`FND-001`, ...) содержит уровень критичности (`Critical` / `High` / `Medium` / `Low`), статус доказанности (`confirmed_defect` или `question_or_risk`), точную цитату, место в источнике, объяснение и рекомендацию.
4. **Генерация отчётов (`src/server/reportFormatter.ts`, `src/server/pdfFormatter.ts`)**:
   - Отчёт на русском языке в форматах **PDF** (через `pdfkit` с кириллическим шрифтом `DejaVuSans`), **Markdown** и **JSON**.

---

## Получение ключа Gemini API и настройка окружения

1. Получите бесплатный API-ключ в Google AI Studio: [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Скопируйте `.env.example` в `.env`:
   ```bash
   cp .env.example .env
   ```
3. Укажите ключ в `.env` (файл `.env` добавлен в `.gitignore` и не попадает в репозиторий):
   ```env
   GEMINI_API_KEY=ваш_ключ_из_google_ai_studio
   GEMINI_MODEL=gemini-3.5-flash-lite
   ```

---

## Установка и запуск

### 1. Установка зависимостей

```bash
npm install
```

### 2. Запуск CLI-анализатора одной командой

```bash
npm run analyze -- --input docs/requirements.md --output output/report.pdf
```

При указании `--output output/report.pdf` агент формирует PDF-отчёт и автоматически сохраняет рядом текстовую и структурированную версии (`output/report.md` и `output/report.json`). Также можно указать `.md` или `.json` напрямую:

```bash
# Сформировать PDF-отчёт (а также .md и .json рядом)
npm run analyze -- --input docs/requirements.md --output output/report.pdf

# Сформировать только Markdown-отчёт
npm run analyze -- --input docs/requirements.md --output output/report.md

# Сформировать только JSON-отчёт
npm run analyze -- --input docs/requirements.md --output output/report.json

# Проверить PDF-документ с требованиями
npm run analyze -- --input path/to/spec.pdf --output output/report.pdf
```

### 3. Запуск веб-интерфейса (опционально)

```bash
npm run dev
```

Сервер запустится на `http://0.0.0.0:3000`. API-ключ используется только на серверной стороне (`server.ts`).

### 4. Проверка типов, сборка и тесты

```bash
npm test
npm run lint
npm run build
```

---

## Структура проекта

- `docs/requirements.md` — исходный проверяемый документ с требованиями.
- `scripts/analyze.ts` — CLI-точка входа (`npm run analyze -- --input ... --output ...`).
- `src/server/documentProcessor.ts` — парсинг Markdown/TXT/PDF и чанкование с сохранением координат источника.
- `src/server/schemas.ts` — схемы Gemini `responseSchema` и runtime-валидация ответов через `zod`.
- `src/server/validator.ts` — двухпроходный конвейер анализа (чанки + сквозной анализ документа).
- `src/server/reportFormatter.ts` — генератор Markdown-отчёта на русском языке.
- `src/server/pdfFormatter.ts` — генератор PDF-отчёта с поддержкой кириллицы (`pdfkit`).
- `tests/validator.test.ts` — модульные и интеграционные тесты обработки документов, схем, CLI и генерации PDF/Markdown.
