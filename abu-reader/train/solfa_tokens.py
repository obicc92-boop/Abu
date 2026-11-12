"""The tokens Abụ's own reader writes for one row of sol-fa, and the way
between them and Abụ's text format (docs/solfa-format.md).

A row such as `s1 | d :-.r /m :d'` is read as
    s _ | d : - . r / m : d ^
Notes are one token each; an octave mark is its own token after the note
(^ up, _ down, twice for two octaves); `|` is a bar line, `/` the medium
accent, `:` a beat, `.` a half and `,` a quarter beat, `-` a hold, `x` a rest.

The bar lines at the very start and end of a row aren't written: a picture
of a row may or may not show the table's borders there, and Abụ ends every
row with one anyway.
"""
import re

NOTES = ['d', 'r', 'm', 'f', 's', 'l', 't', 'de', 're', 'fe', 'se', 'le', 'ra', 'ma', 'lo', 'ta']
MARKS = ['^', '_']
SIGNS = ['|', '/', ':', '.', ',', '-', 'x']
TOKENS = NOTES + MARKS + SIGNS
# Index 0 is CTC's blank.
INDEX = {t: i + 1 for i, t in enumerate(TOKENS)}

_PIECE = re.compile(r"(de|re|fe|se|le|ra|ma|lo|ta|ba|d|r|m|f|s|l|t)('{1,2}|’{1,2}|[12¹²₁₂])?|([|/:.,\-x])|(\s+)|(.)")


def tokenize(row: str) -> list:
    """Abụ row text to tokens. Raises ValueError on anything that isn't sol-fa."""
    out = []
    for m in _PIECE.finditer(row):
        note, mark, sign, space, other = m.groups()
        if space:
            continue
        if other:
            raise ValueError(f'not sol-fa: {other!r} in {row!r}')
        if sign:
            out.append(sign)
            continue
        out.append('ta' if note == 'ba' else note)
        if mark:
            up = mark[0] in "'’¹²"
            two = len(mark) == 2 or mark in '2²₂'
            out += ['^' if up else '_'] * (2 if two else 1)
    while out and out[0] == '|':
        out.pop(0)
    while out and out[-1] == '|':
        out.pop()
    return out


def to_text(tokens: list) -> str:
    """Tokens back to an Abụ row: "s1 | d :-.r /m :d' |"."""
    out = ''
    for t in tokens:
        if t == '^':
            out += "'"
        elif t == '_':
            out += '1' if not out.endswith('1') else '\b2'
        elif t in ('|', '/', ':'):
            out += f' {t}' if t != '|' else ' | '
        else:
            out += t
    out = out.replace('1\b2', '2').replace("''", "''")
    out = re.sub(r'\s+', ' ', out).strip()
    return f'{out} |' if out else out


if __name__ == '__main__':
    for row in ["s1 | d :-.r /m :d | f :m /r :- |", "d' :t1.,l1 | s2 :- |", "| d : :m |", "ba :x.d |"]:
        toks = tokenize(row)
        print(row, '->', ' '.join(toks), '->', to_text(toks))
