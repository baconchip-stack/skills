---
name: redline
description: 문서를 수정할 때 Claude가 바꾸거나 추가한 글자를 빨간색(#FF0000)으로 표시한다. HWP/HWPX, Word(.docx), Excel(.xlsx), HTML/Markdown 문서를 편집·교정·치환·채워넣기 할 때마다 사용한다. "수정한 부분 빨간색", "바뀐 곳 표시", "레드라인", "수정 표시" 요청이나, 사용자가 문서 편집을 맡길 때 자동으로 적용한다.
---

# redline — 수정한 부분은 빨간 글자로

사용자 문서를 편집할 때 **Claude가 새로 쓰거나 바꾼 글자만** 빨간색(`#FF0000`)으로 칠한다.
원래 있던 글자는 색을 건드리지 않는다. 사용자가 다른 색을 말하면 그 색을 쓴다.

## 공통 규칙

1. 원본은 덮어쓰지 않는다. 결과는 새 파일(예: `원본이름_수정.hwp`)로 저장한다.
2. 빨간색은 **삽입·치환된 글자에만** 적용한다. 글꼴·크기·굵기 등 다른 서식은 유지한다.
3. 삭제만 한 경우(대체 글자 없음)는 색으로 표시할 글자가 없으므로, 작업 끝에 "삭제한 내용" 목록으로 보고한다.
4. 작업이 끝나면 바뀐 위치와 내용을 짧게 표로 요약한다.

## HWP / HWPX

`scripts/redline.js` 가 편집과 빨간색 적용을 한 번에 한다(`k-skill-rhwp` / `@rhwp/core` 사용).

준비(최초 1회): `npm install -g k-skill-rhwp`

1. 좌표 확인: `npx k-skill-rhwp info <input>` , 표가 있으면 `npx k-skill-rhwp list-paragraphs <input>`
2. 편집 목록을 `ops.json` 으로 작성한다(UTF-8, 스크래치패드에 저장). 위에서부터 순서대로 적용된다.

   ```json
   [
     { "op": "replace", "query": "2025", "replacement": "2026" },
     { "op": "insert", "section": 0, "paragraph": 3, "offset": 0, "text": "추가 문장" },
     { "op": "cell", "section": 0, "parentParagraph": 5, "control": 0, "cell": 2, "cellParagraph": 0, "text": "새 값" },
     { "op": "color", "section": 0, "paragraph": 2, "start": 4, "end": 10 },
     { "op": "cellColor", "section": 0, "parentParagraph": 5, "control": 0, "cell": 2, "start": 0, "end": 3 }
   ]
   ```

   - `replace`: 본문 문단 전체에서 일치하는 곳을 모두 바꾸고 바뀐 글자를 빨갛게 칠한다. `caseSensitive` 선택. 표 셀 안은 찾지 않는다 → `cell` 사용.
   - `insert`: 해당 위치에 글자를 넣고 빨갛게 칠한다. 줄바꿈 불가 — 문단마다 따로 넣는다.
   - `cell`: 표 셀 문단 내용을 바꾸고(`"replace": false` 면 뒤에 덧붙임) 빨갛게 칠한다.
   - `cellInsert`: 표 셀 문단의 `offset` 위치에 글자를 끼워 넣고 빨갛게 칠한다(서명란 `신청인 ___ (인)` 같은 곳).
   - `color` / `cellColor`: 다른 도구로 이미 고친 범위 `[start, end)` 에 색만 입힌다.

3. 실행:

   ```bash
   node <이 스킬 폴더>/scripts/redline.js <input.hwp> <output.hwp> --ops ops.json [--color "#FF0000"]
   ```

   출력 JSON의 `changes` 로 실제 바뀐 위치를 확인한다. `warning` 이 있으면(찾지 못함) 사용자에게 알린다.
4. 검증: `npx k-skill-rhwp info <output>` 로 문단 수/길이를 확인한다. HWPX 입력도 출력은 `.hwp` 로만 저장된다(rhwp 제약).

## Word (.docx)

python-docx 또는 XML 직접 편집. 바꾼 글자를 별도 run 으로 분리하고 그 run 에만 색을 준다.

- python-docx: `run.font.color.rgb = RGBColor(0xFF, 0x00, 0x00)`
- XML: `<w:rPr>` 안에 `<w:color w:val="FF0000"/>` (기존 rPr 의 다른 속성은 복사해서 유지)

단어 하나만 바뀌었으면 run 을 앞/수정/뒤 세 개로 쪼개 수정 run 만 칠한다. 문단 전체를 칠하지 않는다.

## Excel (.xlsx)

openpyxl 로 값을 바꾼 셀의 글자색만 변경: 기존 `cell.font` 를 `copy(cell.font, color="FFFF0000")` 로 교체한다.
셀 일부 글자만 바뀐 경우 `CellRichText` / `TextBlock(InlineFont(color="FFFF0000"), ...)` 로 해당 부분만 칠한다.

## HTML / Markdown

바뀐 글자를 `<span style="color:#FF0000">…</span>` 으로 감싼다. Markdown 렌더러가 HTML 을 허용하지 않는 곳이면 사용자에게 알린다.

## 적용하지 않는 경우

- 소스 코드, 설정 파일 등 색 개념이 없는 텍스트 파일 → 색 대신 응답에서 변경 내용을 요약한다.
- 사용자가 "색 표시 없이"라고 하면 이 스킬을 쓰지 않는다.
