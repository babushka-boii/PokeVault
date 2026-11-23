"""Evaluate authorized originals locally; only catalog queries use the network.

Images are read by hash from an explicitly supplied directory, never copied into
this repository. Baseline compatibility uses full-size lossless PNG decoding.
"""
import argparse
import asyncio
import hashlib
import io
import json
import os
import platform
import resource
import shutil
import subprocess
import sys
import time
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image, ImageOps
import pillow_heif

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parents[1]


def tree_rss():
    rows = [tuple(map(int, line.split())) for line in subprocess.check_output(
        ['ps', '-axo', 'pid=,ppid=,rss='], text=True).splitlines() if len(line.split()) == 3]
    children = {os.getpid()}
    while True:
        found = {pid for pid, parent, _ in rows if parent in children}
        if found <= children:
            break
        children.update(found)
    return sum(rss for pid, _, rss in rows if pid in children) / 1024


async def memory(stop):
    peak = 0
    while not stop.is_set():
        peak = max(peak, await asyncio.to_thread(tree_rss))
        try:
            await asyncio.wait_for(stop.wait(), 0.05)
        except TimeoutError:
            pass
    return round(peak, 2)


def cpu_seconds():
    return sum(r.ru_utime + r.ru_stime for r in (
        resource.getrusage(resource.RUSAGE_SELF), resource.getrusage(resource.RUSAGE_CHILDREN)))


async def evaluate(args, backend_root):
    sys.path.insert(0, str(backend_root))
    from app.cards.provider import CardProvider
    from app.scanner.ocr import OCRService
    from app.scanner.matching import match_candidates
    from app.scanner.extraction import normalize_text
    from app.scanner.schemas import MatchRequest

    manifest = json.loads(args.manifest.read_text())
    allowed = {row['sha256']: row for row in manifest['cases']}
    found = {}
    for path in args.input_dir.iterdir():
        if path.is_file() and path.suffix.lower() in {'.heic', '.heif', '.png', '.jpg', '.jpeg'}:
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if digest in allowed:
                found[digest] = path
    if set(found) != set(allowed):
        raise SystemExit('Required authorized input hashes are missing; originals must remain unchanged.')
    provider = CardProvider()
    rows = []
    for expected in manifest['cases']:
        original = found[expected['sha256']].read_bytes()
        raw = original
        mime = 'image/heic'
        if args.baseline or args.png:
            with Image.open(io.BytesIO(original)) as image:
                if image.width * image.height > 16_000_000:
                    raise SystemExit('Evaluation input exceeds application pixel limit')
                oriented = ImageOps.exif_transpose(image).convert('RGB')
                clean = Image.new('RGB', oriented.size)
                clean.paste(oriented)
                buffer = io.BytesIO()
                clean.save(buffer, format='PNG')
                raw = buffer.getvalue()
            mime = 'image/png'
        stop = asyncio.Event()
        sampler = asyncio.create_task(memory(stop))
        start = time.perf_counter()
        cpu = cpu_seconds()
        try:
            ocr = await OCRService().recognize(raw, mime)
            ocr_seconds = time.perf_counter() - start
            matches = await match_candidates(provider, MatchRequest(clues=ocr.clues, language='en'))
        finally:
            stop.set()
        peak = await sampler
        ids = [candidate.card.id for candidate in matches.candidates]
        rows.append({
            'sample': expected['sample'], 'original_sha256': expected['sha256'],
            'processed_input_sha256': hashlib.sha256(raw).hexdigest(), 'mime': mime,
            'expected_id': expected['expected_id'], 'clues': ocr.clues.model_dump(),
            'ocr_warnings': ocr.warnings,
            'card_detected': 'card_rectified' in ocr.warnings if not args.baseline else None,
            'name_exact': normalize_text(ocr.clues.name) == normalize_text(expected['name']),
            'number_exact': ocr.clues.local_number == expected['number'],
            'total_exact': ocr.clues.printed_total == expected['total'],
            'top1': bool(ids and ids[0] == expected['expected_id']),
            'top3': expected['expected_id'] in ids[:3],
            'candidates': [{'id':c.card.id,'quality':c.quality,'evidence':c.evidence} for c in matches.candidates],
            'match_warnings': matches.warnings, 'limited':matches.limited,
            'ocr_seconds':round(ocr_seconds,4), 'total_seconds':round(time.perf_counter()-start,4),
            'cpu_seconds':round(cpu_seconds()-cpu,4), 'peak_sampled_tree_rss_mib':peak,
        })
        print(expected['sample'], rows[-1]['clues'], ids[:3], flush=True)
    return {
        'date':args.date, 'implementation':'baseline' if args.baseline else 'improved',
        'input_mode':'lossless full-image PNG decode' if args.baseline or args.png else 'original HEIC bytes',
        'platform':platform.platform(), 'python':platform.python_version(),
        'source_hashes':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (backend_root/'app/scanner').glob('*.py')},
        'scope':'Two authorized real photos; no independent held-out photo set. No global accuracy claim.',
        'memory_method':'Approximate 50ms sampled evaluator/descendant RSS including brief ps; not a hard ceiling. CPU sums process self and reaped children.',
        'metrics':{key:sum(bool(row[key]) for row in rows) for key in ('name_exact','number_exact','total_exact','top1','top3')},
        'photos':rows,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input-dir',type=Path,required=True)
    parser.add_argument('--manifest',type=Path,default=ROOT/'private_photo_manifest.json')
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--date',required=True)
    parser.add_argument('--baseline',action='store_true')
    parser.add_argument('--png',action='store_true')
    args=parser.parse_args()
    pillow_heif.register_heif_opener(decode_threads=1,thumbnails=False,depth_images=False,aux_images=False)
    with TemporaryDirectory(prefix='pokevault-baseline-') as directory:
        backend_root=PROJECT/'backend'
        if args.baseline:
            backend_root=Path(directory)
            shutil.copytree(PROJECT/'backend/app',backend_root/'app',ignore=shutil.ignore_patterns('__pycache__'))
            for path in (ROOT/'baseline_snapshot').glob('*.py'):
                shutil.copyfile(path,backend_root/'app/scanner'/path.name)
        result=asyncio.run(evaluate(args,backend_root))
    args.output.write_text(json.dumps(result,indent=2)+'\n')


if __name__ == '__main__':
    main()
