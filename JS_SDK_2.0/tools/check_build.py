"""Quét bản build: KHÔNG được còn ghi chú dev hay tiếng Việt ngoài bảng dịch. Xem docs/BUILD_RULES.md mục 2.

  python JS_SDK_2.0/tools/check_build.py <Build/<version>> [--allow <file bảng dịch>]...

Kiểm mọi file văn bản ship ra (.html .js .css .json .txt):
  1. ghi chú: <!-- --> (trừ cái chứa PRODUCT_VERSION), /* */ trong JS/CSS/HTML, // ở đầu dòng trong JS
  2. chữ tiếng Việt (ký tự CHỈ tiếng Việt có: ă đ ơ ư + dấu riêng) — chỉ được nằm trong các chuỗi lấy từ file
     --allow (bảng dịch tiếng Việt, menu chọn ngôn ngữ "Tiếng Việt"…)
Thoát mã 1 nếu có lỗi -> build.mjs dừng, không ship.
"""
import os, re, sys

VI_ONLY = re.compile(r'[ăđơưĂĐƠƯảạằắẳẵặầấẩẫậẻẽẹềếểễệỉĩịỏọồốổỗộờớởỡợủũụừứửữựỳỷỹỵ]')
AZ_BLOCK = re.compile(r'/\* ===== AZGAMES SETTINGS ===== \*/[\s\S]*?/\* =+ \*/')
LIT = re.compile(r"'(?:[^'\\\n]|\\.)*'|\"(?:[^\"\\\n]|\\.)*\"|`(?:[^`\\]|\\.)*`")


def literals(text):
    return {m.group(0)[1:-1] for m in LIT.finditer(text)}


def main():
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    target, allow_files = args[0], []
    i = 1
    while i < len(args):
        if args[i] == '--allow' and i + 1 < len(args):
            allow_files.append(args[i + 1]); i += 2
        else:
            i += 1
    allowed = set()
    for f in allow_files:
        paths = [os.path.join(b, n) for b, _, ns in os.walk(f) for n in ns] if os.path.isdir(f) else [f]   # a directory = every file in it
        for q in paths:
            if os.path.exists(q):
                allowed |= literals(open(q, encoding='utf8').read())

    problems, files = [], 0
    for base, _, names in os.walk(target):
        for n in names:
            if not n.endswith(('.html', '.js', '.css', '.json', '.txt')):
                continue
            p = os.path.join(base, n); rel = os.path.relpath(p, target); files += 1
            s = open(p, encoding='utf8', errors='replace').read()
            if n.endswith('.html'):
                for m in re.finditer(r'<!--[\s\S]*?-->', s):
                    if 'PRODUCT_VERSION' not in m.group(0):
                        problems.append(f'{rel}: HTML comment: {m.group(0)[:60]}')
            scan = AZ_BLOCK.sub('', s) if n.endswith('.html') else s   # AZ_SETTINGS keeps its English comments (docs/JSGMSDK.md B.7)
            if n.endswith(('.js', '.css', '.html')) and n != 'loader.js':   # loader đã làm rối, không có ghi chú
                for m in re.finditer(r'/\*[\s\S]*?\*/', scan):
                    problems.append(f'{rel}: block comment: {m.group(0)[:60]}')
            if n.endswith('.js'):
                for line in s.split('\n'):
                    if line.lstrip().startswith('//'):
                        problems.append(f'{rel}: line comment: {line.strip()[:60]}')
            # tiếng Việt: chuỗi bao quanh ký tự phải nằm trong bảng dịch
            for m in VI_ONLY.finditer(s):
                q = max(s.rfind("'", 0, m.start()), s.rfind('"', 0, m.start()), s.rfind('`', 0, m.start()))
                ends = [x for x in (s.find("'", m.end()), s.find('"', m.end()), s.find('`', m.end())) if x != -1]
                e = min(ends) if ends else len(s)
                if s[q + 1:e] not in allowed:
                    ctx = s[max(0, m.start() - 30):m.end() + 30].replace('\n', ' ')
                    problems.append(f'{rel}: Vietnamese outside i18n: ...{ctx}...')

    seen = set(); uniq = [x for x in problems if not (x in seen or seen.add(x))]
    print(f'check_build: {files} text file(s) in {target}')
    if uniq:
        print(f'FAILED: {len(uniq)} problem(s)')
        for x in uniq[:40]:
            print('  ' + x)
        sys.exit(1)
    print('OK: no dev comments; Vietnamese only inside the translation table.')


if __name__ == '__main__':
    main()
