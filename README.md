# skills

Claude Code 등 코딩 에이전트용 개인 스킬 모음. [skills.sh](https://skills.sh) 형식.

## 설치

```bash
npx skills add baconchip-stack/skills
# 특정 스킬만
npx skills add baconchip-stack/skills --skill redline
```

## 스킬 목록

| 스킬 | 설명 |
| --- | --- |
| [redline](skills/redline/SKILL.md) | 문서를 수정할 때 바뀐/추가된 글자를 빨간색으로 표시 (HWP·DOCX·XLSX·HTML/MD) |

### redline 요구사항

HWP/HWPX 편집에는 Node.js 18+ 와 `k-skill-rhwp` 가 필요하다.

```bash
npm install -g k-skill-rhwp
```
