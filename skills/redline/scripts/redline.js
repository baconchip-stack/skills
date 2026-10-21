#!/usr/bin/env node
// redline: HWP 문서를 편집하면서, 바뀐 글자를 빨간색(기본 #FF0000)으로 칠한다.
//
// 사용법:
//   node redline.js <input.hwp|hwpx> <output.hwp> --ops ops.json [--color "#FF0000"]
//
// ops.json 은 편집 목록(JSON 배열)이다. 위에서부터 차례로 적용된다.
//   { "op": "replace", "query": "2025", "replacement": "2026", "caseSensitive": false }
//   { "op": "insert",  "section": 0, "paragraph": 3, "offset": 0, "text": "추가 문장" }
//   { "op": "cell",    "section": 0, "parentParagraph": 5, "control": 0, "cell": 2,
//                      "cellParagraph": 0, "text": "새 값", "replace": true }
//   { "op": "cellInsert", "section": 0, "parentParagraph": 5, "control": 0, "cell": 2,
//                      "cellParagraph": 0, "offset": 7, "text": "홍길동" }
//   { "op": "color",   "section": 0, "paragraph": 2, "start": 4, "end": 10 }   // 이미 바뀐 글자만 칠하기
//   { "op": "cellColor", "section": 0, "parentParagraph": 5, "control": 0, "cell": 2,
//                      "cellParagraph": 0, "start": 0, "end": 3 }

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function loadLib() {
  const candidates = [process.cwd(), path.join(__dirname, "..")];
  try {
    candidates.push(execSync("npm root -g", { encoding: "utf8" }).trim());
  } catch (_) {
    // npm 이 없으면 전역 경로는 건너뛴다
  }
  for (const base of candidates) {
    try {
      return require(require.resolve("k-skill-rhwp", { paths: [base] }));
    } catch (_) {
      // 다음 후보
    }
  }
  throw new Error(
    "k-skill-rhwp 를 찾을 수 없습니다. 먼저 설치하세요: npm install -g k-skill-rhwp"
  );
}

function parseArgs(argv) {
  const args = { positional: [], color: "#FF0000" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ops") args.ops = argv[++i];
    else if (a === "--color") args.color = argv[++i];
    else args.positional.push(a);
  }
  return args;
}

function check(raw, label) {
  const result = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (result && result.ok === false) {
    throw new Error(`${label} 실패: ${JSON.stringify(result)}`);
  }
  return result;
}

// 줄바꿈 문자: CR, LF, U+2028, U+2029
const LINE_BREAK = new RegExp("[" + String.fromCharCode(13, 10, 0x2028, 0x2029) + "]");

function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function assertSingleLine(text, label) {
  if (typeof text !== "string" || LINE_BREAK.test(text)) {
    throw new Error(`${label}: text 에 줄바꿈을 넣을 수 없습니다. 문단마다 insert op 를 나눠 주세요.`);
  }
}

function applyOps(doc, ops, color) {
  const props = JSON.stringify({ textColor: color });
  const changes = [];

  for (const [i, op] of ops.entries()) {
    const label = `ops[${i}] ${op.op}`;
    switch (op.op) {
      case "replace": {
        assertSingleLine(op.replacement, label);
        if (!op.query) throw new Error(`${label}: query 가 비어 있습니다.`);
        // searchText 는 커서 "다음" 글자부터 찾아 문단 맨 앞 일치를 놓치므로, 본문 문단을 직접 스캔한다.
        const fold = (s) => (op.caseSensitive === true ? s : s.toLowerCase());
        const query = fold(op.query);
        let count = 0;
        for (let sec = 0; sec < doc.getSectionCount(); sec++) {
          for (let para = 0; para < doc.getParagraphCount(sec); para++) {
            let from = 0;
            for (;;) {
              const len = doc.getParagraphLength(sec, para);
              const at = fold(doc.getTextRange(sec, para, 0, len)).indexOf(query, from);
              if (at < 0) break;
              check(doc.deleteText(sec, para, at, op.query.length), `${label} deleteText`);
              if (op.replacement.length > 0) {
                check(doc.insertText(sec, para, at, op.replacement), `${label} insertText`);
                check(doc.applyCharFormat(sec, para, at, at + op.replacement.length, props), `${label} applyCharFormat`);
              }
              changes.push({ op: "replace", section: sec, paragraph: para, offset: at, text: op.replacement });
              count++;
              from = at + op.replacement.length;
            }
          }
        }
        if (count === 0) changes.push({ op: "replace", query: op.query, warning: "본문에서 찾지 못함(표 셀 안이면 cell op 사용)" });
        break;
      }
      case "insert": {
        assertSingleLine(op.text, label);
        check(doc.insertText(op.section, op.paragraph, op.offset, op.text), `${label} insertText`);
        check(doc.applyCharFormat(op.section, op.paragraph, op.offset, op.offset + op.text.length, props), `${label} applyCharFormat`);
        changes.push({ op: "insert", section: op.section, paragraph: op.paragraph, offset: op.offset, text: op.text });
        break;
      }
      case "cell": {
        assertSingleLine(op.text, label);
        const cp = op.cellParagraph || 0;
        const at = [op.section, op.parentParagraph, op.control, op.cell, cp];
        let offset = 0;
        if (op.replace !== false) {
          const len = doc.getCellParagraphLength(...at);
          if (len > 0) check(doc.deleteTextInCell(...at, 0, len), `${label} deleteTextInCell`);
        } else {
          offset = doc.getCellParagraphLength(...at);
        }
        check(doc.insertTextInCell(...at, offset, op.text), `${label} insertTextInCell`);
        check(doc.applyCharFormatInCell(...at, offset, offset + op.text.length, props), `${label} applyCharFormatInCell`);
        changes.push({ op: "cell", cell: op.cell, control: op.control, text: op.text });
        break;
      }
      case "cellInsert": {
        assertSingleLine(op.text, label);
        const at = [op.section, op.parentParagraph, op.control, op.cell, op.cellParagraph || 0];
        check(doc.insertTextInCell(...at, op.offset, op.text), `${label} insertTextInCell`);
        check(doc.applyCharFormatInCell(...at, op.offset, op.offset + op.text.length, props), `${label} applyCharFormatInCell`);
        changes.push({ op: "cellInsert", cell: op.cell, control: op.control, offset: op.offset, text: op.text });
        break;
      }
      case "color": {
        check(doc.applyCharFormat(op.section, op.paragraph, op.start, op.end, props), `${label} applyCharFormat`);
        changes.push({ op: "color", section: op.section, paragraph: op.paragraph, start: op.start, end: op.end });
        break;
      }
      case "cellColor": {
        const at = [op.section, op.parentParagraph, op.control, op.cell, op.cellParagraph || 0];
        check(doc.applyCharFormatInCell(...at, op.start, op.end, props), `${label} applyCharFormatInCell`);
        changes.push({ op: "cellColor", cell: op.cell, control: op.control, start: op.start, end: op.end });
        break;
      }
      default:
        throw new Error(`${label}: 알 수 없는 op 입니다 (replace|insert|cell|cellInsert|color|cellColor).`);
    }
  }
  return changes;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [input, output] = args.positional;
  if (!input || !output || !args.ops) {
    console.error("사용법: node redline.js <input.hwp> <output.hwp> --ops ops.json [--color \"#FF0000\"]");
    process.exit(2);
  }
  if (path.resolve(input) === path.resolve(output)) {
    throw new Error("output 은 input 과 다른 경로여야 합니다(원본 보호).");
  }
  const ops = JSON.parse(stripBom(fs.readFileSync(args.ops, "utf8")));
  if (!Array.isArray(ops)) throw new Error("ops.json 은 JSON 배열이어야 합니다.");

  const lib = loadLib();
  const doc = await lib.loadDocument(input);
  try {
    const changes = applyOps(doc, ops, args.color);
    const written = lib.writeHwp(doc, output);
    console.log(JSON.stringify({ ok: true, color: args.color, changes, ...written }, null, 2));
  } finally {
    doc.free();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message || String(err) }));
  process.exit(1);
});
