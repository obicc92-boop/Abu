"""The trained row reader as ONNX, for the web app to run in the browser with
ONNX Runtime Web (adapted from SonkoMusic's export.py).

    ../.venv/bin/python -I export.py --model ../runs/rows1/best.pt --out ../../abu-app/public/reader/rows.onnx

Input `image`: 1 × 1 × 64 × width (ink 1, paper 0; width a multiple of 4).
Output `tokens`: 1 × width/4 × classes, raw scores (CTC blank first). The
vocabulary and how to cut a row out go beside it in rows.json. Checks that
ONNX Runtime reads like PyTorch when onnxruntime is installed.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # this folder (run with python -I)

import torch  # noqa: E402

from rowreader import ABOVE, BELOW, HEIGHT, SIDE, STRIDE, RowReader  # noqa: E402
from solfa_tokens import TOKENS  # noqa: E402


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--model', required=True)
    p.add_argument('--out', required=True)
    args = p.parse_args()
    state = torch.load(args.model, map_location='cpu')
    model = RowReader()
    model.load_state_dict(state['model'])
    model.eval()
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    dummy = torch.rand(1, 1, HEIGHT, 800)
    torch.onnx.export(model, dummy, str(out), input_names=['image'], output_names=['tokens'], dynamic_axes={'image': {3: 'width'}, 'tokens': {1: 'steps'}}, opset_version=17)
    meta = {
        'height': HEIGHT,
        'stride': STRIDE,
        'band': {'above': ABOVE, 'below': BELOW, 'side': SIDE},
        'tokens': TOKENS,
        'trained': {'step': state.get('step'), 'held_error': state.get('held_error'), 'held_exact': state.get('held_exact')},
    }
    out.with_suffix('.json').write_text(json.dumps(meta))
    print('wrote', out, out.stat().st_size // 1024, 'KB')
    try:
        import numpy as np
        import onnxruntime as ort
    except ImportError:
        return
    x = torch.rand(1, 1, HEIGHT, 1200)
    want = model(x).detach().numpy()
    got = ort.InferenceSession(str(out)).run(None, {'image': x.numpy()})[0]
    print('ONNX Runtime agrees with PyTorch:', bool(np.allclose(want, got, atol=1e-3)), float(np.abs(want - got).max()))


if __name__ == '__main__':
    main()
