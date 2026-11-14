# Scores a trained reader on folders of rows (the share of tokens wrong, rows exact), each folder on its own.
# Usage: eval_reader.py <model.pt> <folder>...
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'train'))  # abu-reader/train
import torch
from rowreader import RowReader, Rows, collate
from train import evaluate

if __name__ == '__main__':
    torch.set_num_threads(6)
    model = RowReader()
    model.load_state_dict(torch.load(sys.argv[1], map_location='cpu')['model'])
    for folder in sys.argv[2:]:
        loader = torch.utils.data.DataLoader(Rows([folder], train=False), batch_size=24, shuffle=False, num_workers=0, collate_fn=collate)
        err, exact, n = evaluate(model, loader)
        print(f'{folder.rstrip("/").rsplit("/", 1)[-1]:<12} {n} rows: {err:.1%} of tokens wrong, {exact:.1%} of rows exact', flush=True)
