from pathlib import Path
import csv
import json
import re
from collections import defaultdict

SRC_DIR = Path('/Users/xlcleo/Desktop/Topic/JiangZaiwen/prudential-exam/papers_py')
OUT_FILE = Path('/Users/xlcleo/WeChatProjects/IIQE/utils/exam-data.js')

if not SRC_DIR.exists():
    raise SystemExit(f'Source dir not found: {SRC_DIR}')

csv_files = sorted(SRC_DIR.glob('*.csv'))
if not csv_files:
    raise SystemExit('No CSV files found')

chapter_title_map = {
    '1': '第1章 人寿保险简介',
    '2': '第2章 人寿保险及年金的种类',
    '3': '第3章 保险利益附约及其他产品',
    '4': '第4章 阐释人寿保险单',
    '5': '第5章 人寿保险程序',
}


def is_paper3(name: str) -> bool:
    return ('試卷三' in name) or ('长' in name and '保險' in name) or ('⾧期' in name)


def clean_chapter(sec: str) -> str:
    s = (sec or '').replace('\r', '\n').strip()
    s = s.replace('参考章節', '').replace('參考章節', '')
    s = s.replace('註', '').replace('©', '')
    s = re.sub(r'\s+', '', s)
    s = s.replace('..', '.')
    if s.startswith('.'):
        s = s[1:]
    return s


def chapter_main(sec: str) -> str:
    m = re.search(r'(\d+)', sec or '')
    return m.group(1) if m else '0'


def parse_question_and_options(raw: str):
    text = (raw or '').replace('\r', '\n').strip()
    # normalize common OCR oddities in option markers
    text = re.sub(r'\n+', '\n', text)
    marks = []
    for m in re.finditer(r'(?i)(^|\n|\s)([a-d])\)', text):
        marks.append((m.start(2), m.group(2).lower()))

    if len(marks) >= 4:
        order = ['a', 'b', 'c', 'd']
        pos = {}
        for p, c in marks:
            if c not in pos:
                pos[c] = p
        if all(k in pos for k in order) and pos['a'] < pos['b'] < pos['c'] < pos['d']:
            a, b, c, d = pos['a'], pos['b'], pos['c'], pos['d']
            stem = text[:a].strip(' \n\t:：')
            o1 = text[a+2:b].strip(' \n\t')
            o2 = text[b+2:c].strip(' \n\t')
            o3 = text[c+2:d].strip(' \n\t')
            o4 = text[d+2:].strip(' \n\t')
            return stem, [o1, o2, o3, o4]

    return text, []


def parse_paper_meta(path: Path, idx: int):
    name = path.stem
    ptype = '卷三' if is_paper3(name) else '卷一'
    ym = re.search(r'(20\d{2})年\s*(\d{1,2})月', name)
    if ym:
        year, month = ym.group(1), int(ym.group(2))
        pid = f"{'paper3' if ptype == '卷三' else 'paper1'}-{year}-{month:02d}"
        title = f'{year}年{month}月真题'
        sort_key = int(f'{year}{month:02d}')
        is_mock = False
    else:
        is_mock = True
        mock_idx = idx + 1
        pid = f"{'paper3' if ptype == '卷三' else 'paper1'}-mock-{mock_idx:02d}"
        title = f"{ptype}模拟试题{mock_idx}"
        sort_key = 0
    return {
        'id': pid,
        'type': ptype,
        'title': title,
        'premium': True,
        'isMock': is_mock,
        '_sortKey': sort_key,
        '_name': name,
    }


papers = []
questions_by_paper = {}

for i, csv_file in enumerate(csv_files):
    paper = parse_paper_meta(csv_file, i)
    rows = []
    used_ids = set()

    with csv_file.open('r', encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        for row_idx, row in enumerate(reader, start=1):
            qno_raw = (row.get('題號') or '').strip()
            if not qno_raw.isdigit():
                continue
            qno = int(qno_raw)
            sec = clean_chapter(row.get('參考章節') or '')
            stem, options = parse_question_and_options(row.get('問題') or '')
            explain = (row.get('解釋') or '').replace('\r', '\n').strip()

            ans_letter = (row.get('答案') or '').strip().upper()
            ans_map = {'A': 0, 'B': 1, 'C': 2, 'D': 3}
            answer = ans_map.get(ans_letter, -1)

            if len(options) < 4:
                options = ['选项A', '选项B', '选项C', '选项D']

            qid = f"{paper['id']}-{qno:04d}"
            if qid in used_ids:
                qid = f"{paper['id']}-{qno:04d}-{row_idx}"
            used_ids.add(qid)

            main_no = chapter_main(sec)
            rows.append({
                'id': qid,
                'no': qno,
                'chapter': sec if sec else main_no,
                'chapterName': chapter_title_map.get(main_no, f'第{main_no}章'),
                'stem': stem,
                'options': options,
                'answer': answer,
                'explain': explain,
            })

    rows.sort(key=lambda x: x['no'])
    questions_by_paper[paper['id']] = rows
    paper['total'] = len(rows)
    papers.append(paper)

# premium policy: each type newest 1 paper trial, others premium, mock all premium
for ptype in ['卷三', '卷一']:
    normal = [p for p in papers if p['type'] == ptype and not p['isMock']]
    normal.sort(key=lambda x: x['_sortKey'], reverse=True)
    if normal:
        normal[0]['premium'] = False

# final sort
papers.sort(key=lambda p: (0 if p['type'] == '卷三' else 1, -p['_sortKey'], p['_name']))
for p in papers:
    p.pop('_sortKey', None)
    p.pop('_name', None)

js = """// Auto-generated from CSV files. Do not edit manually.\n"""
js += f"const chapterTitleMap = {json.dumps(chapter_title_map, ensure_ascii=False, indent=2)};\n\n"
js += f"const papers = {json.dumps(papers, ensure_ascii=False, indent=2)};\n\n"
js += f"const questionsByPaper = {json.dumps(questions_by_paper, ensure_ascii=False, indent=2)};\n\n"
js += """
function getPapersByType(type) {
  return papers
    .filter((p) => p.type === type)
    .map((p) => ({ ...p, total: (questionsByPaper[p.id] || []).length }));
}

function getPaperById(id) {
  return papers.find((p) => p.id === id);
}

function getQuestionsByPaperId(id) {
  return questionsByPaper[id] || [];
}

module.exports = {
  chapterTitleMap,
  papers,
  questionsByPaper,
  getPaperById,
  getPapersByType,
  getQuestionsByPaperId,
};
"""

OUT_FILE.write_text(js, encoding='utf-8')

print(f'CSV files: {len(csv_files)}')
print(f'Papers generated: {len(papers)}')
print(f'Total questions: {sum(len(v) for v in questions_by_paper.values())}')
print(f'Output: {OUT_FILE}')
