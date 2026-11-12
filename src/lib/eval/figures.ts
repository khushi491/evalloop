import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Analysis, Interval } from "./analyze";
import { formatInterval } from "./analyze";

export interface ChartPoint {
  x: string;
  y: number;
  low: number;
  high: number;
}

export interface ChartSeries {
  name: string;
  points: ChartPoint[];
}

export interface ChartSpec {
  filename: string;
  title: string;
  yLabel: string;
  mock: boolean;
  series: ChartSeries[];
}

const WIDTH = 720;
const HEIGHT = 420;

function intervalPoint(label: string, interval: Interval | null): ChartPoint | null {
  if (!interval) return null;
  return { x: label, y: interval.mean, low: interval.low, high: interval.high };
}

export function chartsFromAnalysis(analysis: Analysis): ChartSpec[] {
  const mock = analysis.mock;
  const hard: ChartSeries = {
    name: "Hard-check pass rate",
    points: analysis.methods.flatMap((method) => {
      const point = intervalPoint(
        `${method.method}/${method.stopping}/${method.feedback}`,
        method.hardPass
      );
      return point ? [point] : [];
    }),
  };
  const judge: ChartSeries = {
    name: "Judge score",
    points: analysis.methods.flatMap((method) => {
      const point = intervalPoint(
        `${method.method}/${method.stopping}/${method.feedback}`,
        method.judge
      );
      return point ? [point] : [];
    }),
  };
  const gapSeries: ChartSeries[] = analysis.gapByIteration.map((series) => ({
    name: series.label,
    points: series.points.flatMap((point) => {
      const drawn = intervalPoint(String(point.iteration), point.gap);
      return drawn ? [drawn] : [];
    }),
  }));
  const transferPoints: ChartPoint[] = [];
  const hardDelta = intervalPoint("hard-check points", analysis.transfer.hardDelta);
  const judgeDelta = intervalPoint("judge points", analysis.transfer.judgeDelta);
  if (hardDelta) transferPoints.push(hardDelta);
  if (judgeDelta) transferPoints.push(judgeDelta);
  const cost: ChartSeries = {
    name: "Tokens per hard-check point",
    points: analysis.methods.flatMap((method) => {
      const point = intervalPoint(method.method, method.tokensPerPoint);
      return point ? [point] : [];
    }),
  };
  return [
    {
      filename: "hard-check-by-method",
      title: "Final hard-check pass rate",
      yLabel: "Pass rate",
      mock,
      series: [hard],
    },
    {
      filename: "judge-by-method",
      title: "Final judge score",
      yLabel: "Judge score",
      mock,
      series: [judge],
    },
    {
      filename: "gap-by-iteration",
      title: "Judge minus hard-check over iterations",
      yLabel: "Judge − hard-check points",
      mock,
      series: gapSeries,
    },
    {
      filename: "heldout-transfer",
      title: "Held-out transfer, learned minus initial",
      yLabel: "Difference",
      mock,
      series: [{ name: "Policy transfer", points: transferPoints }],
    },
    {
      filename: "cost-per-point",
      title: "Tokens per hard-check point gained",
      yLabel: "Tokens per point",
      mock,
      series: [cost],
    },
  ];
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type), Buffer.from(data)]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

export function encodePng(width: number, height: number, rgba: Uint8Array, text: string): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 4);
    raw[row] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, row + 1);
  }
  const textBytes = Buffer.from(`Description\0${text}`, "latin1");
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("tEXt", textBytes),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function pdfEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function encodePdf(spec: ChartSpec): Buffer {
  const banner = spec.mock ? "MOCK DATA - not a real run" : "Live run";
  const lines = [
    spec.title,
    banner,
    spec.yLabel,
    ...spec.series.flatMap((series) => [
      series.name,
      ...series.points.map(
        (point) => `${point.x}  ${point.y.toFixed(3)}  [${point.low.toFixed(3)}, ${point.high.toFixed(3)}]`
      ),
    ]),
  ];
  if (lines.length === 2) lines.push("No points.");
  const commands = ["BT", "/F1 11 Tf", "40 520 Td"];
  lines.forEach((line, index) => {
    if (index > 0) commands.push("0 -16 Td");
    commands.push(`(${pdfEscape(line)}) Tj`);
  });
  commands.push("ET");
  const yBase = 80;
  const plotHeight = 280;
  const plotWidth = 480;
  const values = spec.series.flatMap((series) => series.points.map((point) => point.y));
  const min = values.length ? Math.min(0, ...values) : 0;
  const max = values.length ? Math.max(1, ...values) : 1;
  const span = max - min || 1;
  commands.push("0.2 0.2 0.2 RG", "1 w", `40 ${yBase} m`, `${40 + plotWidth} ${yBase} l`, "S");
  spec.series.forEach((series, seriesIndex) => {
    const gray = (0.15 + seriesIndex * 0.2).toFixed(2);
    commands.push(`${gray} ${gray} ${gray} RG`);
    series.points.forEach((point, pointIndex) => {
      const x = 50 + pointIndex * 28 + seriesIndex * 6;
      const y = yBase + ((point.y - min) / span) * plotHeight;
      const low = yBase + ((point.low - min) / span) * plotHeight;
      const high = yBase + ((point.high - min) / span) * plotHeight;
      commands.push(`${x} ${low.toFixed(2)} m ${x} ${high.toFixed(2)} l S`);
      commands.push(`${x - 2} ${y.toFixed(2)} m ${x + 2} ${y.toFixed(2)} l S`);
    });
  });
  const stream = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 560] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}

function paint(spec: ChartSpec): Uint8Array {
  const rgba = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 255;
    rgba[i + 1] = 255;
    rgba[i + 2] = 255;
    rgba[i + 3] = 255;
  }
  const set = (x: number, y: number, red: number, green: number, blue: number) => {
    if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
    const offset = (y * WIDTH + x) * 4;
    rgba[offset] = red;
    rgba[offset + 1] = green;
    rgba[offset + 2] = blue;
    rgba[offset + 3] = 255;
  };
  if (spec.mock) {
    for (let y = 0; y < 18; y++) {
      for (let x = 0; x < WIDTH; x++) set(x, y, 180, 40, 40);
    }
  }
  const values = spec.series.flatMap((series) => series.points.flatMap((point) => [point.low, point.high, point.y]));
  const min = values.length ? Math.min(0, ...values) : 0;
  const max = values.length ? Math.max(1, ...values) : 1;
  const span = max - min || 1;
  const left = 40;
  const base = HEIGHT - 40;
  const plotHeight = 300;
  for (let x = left; x < WIDTH - 20; x++) set(x, base, 40, 40, 40);
  spec.series.forEach((series, seriesIndex) => {
    const shade = 30 + seriesIndex * 40;
    series.points.forEach((point, pointIndex) => {
      const x = left + 16 + pointIndex * 22 + seriesIndex * 5;
      const yOf = (value: number) => base - ((value - min) / span) * plotHeight;
      const y = Math.round(yOf(point.y));
      const low = Math.round(yOf(point.low));
      const high = Math.round(yOf(point.high));
      for (let cursor = Math.min(low, high); cursor <= Math.max(low, high); cursor++) {
        set(x, cursor, shade, shade, shade);
      }
      for (let dx = -3; dx <= 3; dx++) set(x + dx, y, shade, 60, 120);
    });
  });
  return rgba;
}

export function figureCaption(spec: ChartSpec): string {
  return spec.mock ? "MOCK DATA - not a real run" : "Live run";
}

export function writeFigures(directory: string, analysis: Analysis): string[] {
  mkdirSync(directory, { recursive: true });
  const written: string[] = [];
  const charts = chartsFromAnalysis(analysis);
  for (const chart of charts) {
    const label = `${chart.title}. ${figureCaption(chart)}`;
    const png = path.join(directory, `${chart.filename}.png`);
    const pdf = path.join(directory, `${chart.filename}.pdf`);
    writeFileSync(png, encodePng(WIDTH, HEIGHT, paint(chart), label));
    writeFileSync(pdf, encodePdf(chart));
    written.push(png, pdf);
  }
  const table = renderTable(analysis);
  const tex = path.join(directory, "tables.tex");
  const markdown = path.join(directory, "tables.md");
  writeFileSync(tex, table.tex);
  writeFileSync(markdown, table.markdown);
  written.push(tex, markdown);
  return written;
}

function renderTable(analysis: Analysis): { tex: string; markdown: string } {
  const banner = analysis.mock ? "MOCK DATA. Not a real run." : "Live run.";
  const header = "| Condition | Hard-check pass rate | Judge score | Tokens per point gained | USD per point gained | Tasks with no hard-check gain |";
  const rows = analysis.methods.map((method) => {
    const label = `${method.method} / ${method.stopping} / ${method.feedback}`;
    return `| ${label} | ${formatInterval(method.hardPass)} | ${formatInterval(method.judge)} | ${formatInterval(method.tokensPerPoint)} | ${formatInterval(method.usdPerPoint)} | ${method.tasksWithoutGain} |`;
  });
  const markdown = [
    `# EvalLoop analysis`,
    "",
    banner,
    "",
    `Sources: ${analysis.sources.files} files, ${analysis.sources.dryRuns} dry runs, ${analysis.sources.liveRuns} live runs.`,
    "",
    "Intervals are bootstrap 95% percentile intervals of the unweighted task mean.",
    "The gap figure is judge score minus hard-check pass rate times 100.",
    "Tokens and USD per point use only runs whose reported attempt gained hard-check percentage points. A run with no gain is counted and left out of the ratio.",
    "Held-out transfer is learned minus initial, and only for the policy method.",
    "",
    header,
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
    `Held-out hard-check point difference: ${formatInterval(analysis.transfer.hardDelta)}`,
    "",
    `Held-out judge difference: ${formatInterval(analysis.transfer.judgeDelta)}`,
    "",
  ].join("\n");
  const texRows = analysis.methods.map((method) => {
    const label = `${method.method} / ${method.stopping} / ${method.feedback}`.replace(/_/g, "\\_");
    return `${label} & ${formatInterval(method.hardPass)} & ${formatInterval(method.judge)} & ${formatInterval(method.tokensPerPoint)} \\\\`;
  });
  const tex = [
    `% ${banner}`,
    `% Bootstrap 95% intervals. Khushi writes the surrounding prose.`,
    "\\begin{tabular}{llll}",
    "Condition & Hard-check & Judge & Tokens per point \\\\",
    "\\hline",
    ...texRows,
    "\\end{tabular}",
    "",
  ].join("\n");
  return { tex, markdown };
}
