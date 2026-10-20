"""Copy only validation-selected native models into a portable CPU bundle."""
import argparse,hashlib,json,shutil,tarfile
from pathlib import Path
from .common import json_dump


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',type=Path,default=Path('artifacts/benchmark_v1'))
    p.add_argument('--output',type=Path,default=Path('artifacts/deployment_cpu'));a=p.parse_args()
    if a.output.exists():raise FileExistsError('Use a new bundle path to avoid overwriting models')
    a.output.mkdir(parents=True);index=json.loads((a.source/'registry.json').read_text())
    for target,rel in index.items():
        src=a.source/target;dst=a.output/target;dst.mkdir()
        registry=json.loads((src/'registry.json').read_text());models={};weights=[]
        for (name,info),weight in zip(registry['models'].items(),registry['weights']):
            if weight<=0:continue
            (dst/name).mkdir();shutil.copy2(src/name/info['path'],dst/name/info['path'])
            shutil.copy2(src/name/'model.json',dst/name/'model.json')
            models[name]=info;weights.append(weight)
        registry['models']=models;registry['weights']=weights
        json_dump(dst/'registry.json',registry);shutil.copy2(src/'schema.json',dst/'schema.json')
    json_dump(a.output/'registry.json',index);shutil.copy2(a.source/'run.json',a.output/'run.json')
    (a.output/'README.txt').write_text('CredNexus: CPU models trained on synthetic data. Not validated for real credit decisions.\nLoad using crednexus_ml.inference.Predictor(bundle_path, target). See docs/MODELS.md.\n')
    checks={str(p.relative_to(a.output)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(a.output.rglob('*')) if p.is_file()}
    json_dump(a.output/'checksums.json',checks)
    archive=a.output.with_suffix('.tar.gz')
    with tarfile.open(archive,'w:gz') as tf:tf.add(a.output,arcname=a.output.name)
    print(archive,archive.stat().st_size,'bytes')


if __name__=='__main__':main()
