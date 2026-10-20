"""Exact structural export of trained boosters, including categorical splits/CTRs.

CatBoost's own Python exporter supplies frozen CTR tables and category hashes.
No model fitting or distillation occurs. Graphs use standard ONNX operators and
ai.onnx.ml TreeEnsemble v5 / LabelEncoder v2; CPU ONNX Runtime is required.
"""
from __future__ import annotations
import argparse,hashlib,json,runpy,tempfile,importlib.metadata
from pathlib import Path
import numpy as np
import pandas as pd
import onnx
from onnx import helper as H,numpy_helper as NH,TensorProto as T
from .common import json_dump,load_native,refresh_checksums


def signed(v):return (int(v)+(1<<63))%(1<<64)-(1<<63)


class Graph:
    def __init__(self,schema):
        self.schema=schema;self.nodes=[];self.initializers=[];self.count=0
        self.inputs=[H.make_tensor_value_info('features',T.FLOAT,[None,len(schema['columns'])])]
        self.x=self.op('Cast','features',to=T.DOUBLE)
    def name(self):self.count+=1;return f'v{self.count}'
    def const(self,value,dtype=None):
        name=self.name();self.initializers.append(NH.from_array(np.asarray(value,dtype=dtype),name));return name
    def op(self,kind,*inputs,**attrs):
        out=self.name();self.nodes.append(H.make_node(kind,list(inputs),[out],**attrs));return out
    def col(self,i,x=None):return self.op('Gather',x or self.x,self.const([i],np.int64),axis=1)
    def cast(self,x,dtype):return self.op('Cast',x,to=dtype)
    def binary(self,op,x,value,dtype=np.float64):return self.op(op,x,self.const(value,dtype))
    def sum(self,x,axis,keep=1):return self.op('ReduceSum',x,self.const([axis],np.int64),keepdims=keep)
    def missing_categories(self):
        columns=[]
        for i,c in enumerate(self.schema['columns']):
            x=self.col(i)
            if c in self.schema['categories']:x=self.op('Where',self.binary('Less',x,0),self.const(np.nan,np.float64),x)
            columns.append(x)
        return self.op('Concat',*columns,axis=1)
    def save(self,path,result,metadata=None):
        self.nodes.append(H.make_node('Identity',[result],['prediction']))
        graph=H.make_graph(self.nodes,'CredNexusCPU',self.inputs,[H.make_tensor_value_info('prediction',T.DOUBLE,[None,1])],self.initializers)
        model=H.make_model(graph,opset_imports=[H.make_opsetid('',18),H.make_opsetid('ai.onnx.ml',5)],producer_name='crednexus',ir_version=10)
        if metadata:H.set_model_props(model,{k:json.dumps(v,ensure_ascii=False) for k,v in metadata.items()})
        onnx.checker.check_model(model);onnx.save_model(model,path)


def catboost(g,model,schema,temp):
    from catboost import Pool
    # Only category strings are required by the exporter; no training rows/labels.
    n=max(len(v) for v in schema['categories'].values())+2
    pool=pd.DataFrame(0.,index=range(n),columns=schema['columns'])
    for c,values in schema['categories'].items():
        extended=values+['__MISSING__','__UNKNOWN__'];pool[c]=[extended[i%len(extended)] for i in range(n)]
    path=temp/'catboost_reference.py';model.save_model(str(path),format='python',pool=Pool(pool,cat_features=list(schema['categories'])))
    ref=runpy.run_path(str(path));m=ref['catboost_model'];hashes=ref['cat_features_hashes']
    numeric=[i for i,c in enumerate(schema['columns']) if c not in schema['categories']]
    categorical=[i for i,c in enumerate(schema['columns']) if c in schema['categories']]
    bins=[]
    for idx,borders in zip(m.float_features_index,m.float_feature_borders):
        if not borders:continue
        x=g.col(numeric[idx]);gt=g.op('Greater',x,g.const(np.array(borders)[None,:],np.float64))
        bins.append(g.sum(g.cast(gt,T.INT64),1))
    cat_hash=[]
    for idx in categorical:
        values=schema['categories'][schema['columns'][idx]]
        codes=g.col(idx);valid=g.op('And',g.binary('GreaterOrEqual',codes,0),g.binary('Less',codes,len(values)))
        codes=g.op('Where',valid,g.cast(codes,T.INT64),g.const(len(values),np.int64))
        cat_hash.append(g.op('Gather',g.const([hashes[v] for v in values]+[0x7fffffff],np.int64),codes,axis=0))
    packed={idx:i for i,idx in enumerate(m.cat_features_index)}
    for idx,values in zip(m.one_hot_cat_feature_index,m.one_hot_hash_values):
        if not values:continue
        eq=g.op('Equal',cat_hash[packed[idx]],g.const(np.array(values)[None,:],np.int64))
        bins.append(g.sum(g.op('Mul',g.cast(eq,T.INT64),g.const(np.arange(1,len(values)+1)[None,:],np.int64)),1))
    if hasattr(m,'model_ctrs'):
        magic=g.const(0x4906ba494954cb65,np.int64);results=[]
        for group in m.model_ctrs.compressed_model_ctrs:
            h=g.const(0,np.int64)
            parts=[cat_hash[i] for i in group.projection.transposed_cat_feature_indexes]
            for cond in group.projection.binarized_indexes:
                parts.append(g.cast(g.binary('Equal' if cond.check_value_equal else 'GreaterOrEqual',bins[cond.bin_index],cond.value,np.int64),T.INT64))
            for part in parts:h=g.op('Mul',magic,g.op('Add',h,g.op('Mul',magic,part)))
            for ctr in group.model_ctrs:
                data=m.model_ctrs.ctr_data.learn_ctrs[ctr.base_hash];keys=[];values=[]
                for key,bucket in data.index_hash_viewer.items():
                    kind=ctr.base_ctr_type
                    if kind in ('BinarizedTargetMeanValue','FloatTargetMeanValue'):
                        history=data.ctr_mean_history[bucket];good,total=history.sum,history.count
                    elif kind in ('Counter','FeatureFreq'):good,total=data.ctr_total[bucket],data.counter_denominator
                    else:
                        counts=data.ctr_total[bucket*data.target_classes_count:(bucket+1)*data.target_classes_count]
                        good=counts[ctr.target_border_idx] if kind=='Buckets' else sum(counts[ctr.target_border_idx+1:])
                        total=sum(counts)
                    keys.append(signed(key));values.append(float(np.float32(ctr.calc(good,total))))
                value=g.op('LabelEncoder',h,domain='ai.onnx.ml',keys_int64s=keys,values_floats=values,default_float=float(np.float32(ctr.calc(0,0))))
                results.append(value)
        for value,borders in zip(results,m.ctr_feature_borders):
            bins.append(g.sum(g.cast(g.op('Greater',value,g.const(np.array(borders)[None,:],np.float32)),T.INT64),1))
    binary=g.op('Concat',*bins,axis=1)
    depth=max(m.tree_depth);ids=[];borders=[];masks=[];powers=[];offsets=[];leaf=[];pos=0
    for d in m.tree_depth:
        ids.append(m.tree_split_feature_index[pos:pos+d]+[0]*(depth-d))
        borders.append(m.tree_split_border[pos:pos+d]+[0]*(depth-d))
        masks.append(m.tree_split_xor_mask[pos:pos+d]+[0]*(depth-d))
        powers.append([1<<j for j in range(d)]+[0]*(depth-d));offsets.append(len(leaf))
        start=len(leaf);leaf.extend(float(v[0]) for v in m.leaf_values[start:start+(1<<d)]);pos+=d
    selected=g.op('Gather',binary,g.const(ids,np.int64),axis=1)
    xor=g.op('BitwiseXor',selected,g.const(masks,np.int64))
    decisions=g.cast(g.op('GreaterOrEqual',xor,g.const(borders,np.int64)),T.INT64)
    indices=g.sum(g.op('Mul',decisions,g.const(powers,np.int64)),2,0)
    indices=g.op('Add',indices,g.const(np.array(offsets)[None,:],np.int64))
    value=g.sum(g.op('Gather',g.const(leaf,np.float64),indices,axis=0),1)
    return g.binary('Add',g.binary('Mul',value,m.scale),m.biases[0])


class Trees:
    def __init__(self):
        self.feature=[];self.mode=[];self.split=[];self.true=[];self.false=[];self.tleaf=[];self.fleaf=[];self.missing=[];self.weights=[];self.members=[];self.roots=[]
    def leaf(self,value):
        idx=len(self.weights);self.weights.append(float(value));return idx,True
    def node(self,feature,mode,threshold,yes,no,missing,members=None):
        idx=len(self.feature);self.feature.append(feature);self.mode.append(mode);self.split.append(threshold)
        self.true.append(yes[0]);self.false.append(no[0]);self.tleaf.append(int(yes[1]));self.fleaf.append(int(no[1]));self.missing.append(int(missing))
        if mode==6:self.members.extend(members+[np.nan])
        return idx,False
    def root(self,result):
        if result[1]:result=self.node(0,0,0,result,result,False)
        self.roots.append(result[0])
    def graph(self,g,x):
        attrs=dict(aggregate_function=1,post_transform=0,n_targets=1,tree_roots=self.roots,nodes_featureids=self.feature,
            nodes_modes=NH.from_array(np.array(self.mode,dtype=np.uint8)),nodes_splits=NH.from_array(np.array(self.split,dtype=np.float64)),
            nodes_truenodeids=self.true,nodes_falsenodeids=self.false,nodes_trueleafs=self.tleaf,nodes_falseleafs=self.fleaf,
            nodes_missing_value_tracks_true=self.missing,leaf_weights=NH.from_array(np.array(self.weights,dtype=np.float64)),leaf_targetids=[0]*len(self.weights))
        if self.members:attrs['membership_values']=NH.from_array(np.array(self.members,dtype=np.float64))
        return g.op('TreeEnsemble',x,domain='ai.onnx.ml',**attrs)


def lightgbm(g,model):
    dump=model.dump_model();trees=Trees()
    assert not dump.get('average_output',False),'Unsupported averaged forest'
    def visit(node):
        if 'leaf_value' in node:return trees.leaf(node['leaf_value'])
        yes=visit(node['left_child']);no=visit(node['right_child']);kind=node['decision_type'];feature=node['split_feature']
        if kind=='==':return trees.node(feature,6,0,yes,no,False,[float(v) for v in node['threshold'].split('||')])
        assert kind=='<=',kind
        # LightGBM uses zero for NaN when missing_type=None; splits with NaN
        # missing_type honor default_left instead.
        assert node['missing_type'] in ('None','NaN'),node['missing_type']
        missing=node['default_left'] if node['missing_type']=='NaN' else 0<=float(node['threshold'])
        return trees.node(feature,0,float(node['threshold']),yes,no,missing)
    for tree in dump['tree_info']:trees.root(visit(tree['tree_structure']))
    return trees.graph(g,g.missing_categories())


def xgboost(g,model,schema):
    config=json.loads(model.save_config())['learner'];params=config['learner_model_param']
    base=json.loads(params['base_score']);base=float(base[0] if isinstance(base,list) else base)
    if config['objective']['name']=='binary:logistic':base=float(np.log(base/(1-base)))
    trees=Trees();names={c:i for i,c in enumerate(schema['columns'])}
    def visit(node):
        if 'leaf' in node:return trees.leaf(np.float32(node['leaf']))
        children={c['nodeid']:c for c in node['children']};yes=visit(children[node['yes']]);no=visit(children[node['no']]);condition=node['split_condition']
        member=isinstance(condition,list)
        return trees.node(names[node['split']],6 if member else 1,0 if member else float(np.float32(condition)),yes,no,node['missing']==node['yes'],[float(v) for v in condition] if member else None)
    for text in model.get_dump(dump_format='json'):trees.root(visit(json.loads(text)))
    return g.binary('Add',trees.graph(g,g.missing_categories()),base)


def add_model(g,algorithm,model,schema,temp,classification):
    value=catboost(g,model,schema,temp) if algorithm=='catboost' else lightgbm(g,model) if algorithm=='lightgbm' else xgboost(g,model,schema)
    return g.op('Sigmoid',value) if classification else value


def scale(g,target,normalization):
    if normalization=='raw':return g.const(1e6,np.float64)
    key=target.removesuffix('_target');a=g.col(g.schema['columns'].index(key+'_mean_12'));b=g.col(g.schema['columns'].index(key+'_mean_3'))
    mean=g.op('Where',g.op('IsNaN',a),b,a);mean=g.op('Where',g.op('IsNaN',mean),g.const(1e4,np.float64),mean)
    return g.op('Clip',mean,g.const(1e4,np.float64),g.const(1e8,np.float64))


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',type=Path,default=Path('artifacts/single_models'))
    p.add_argument('--output',type=Path,default=Path('models/onnx'));p.add_argument('--components',type=Path,default=Path('artifacts/onnx_components'));a=p.parse_args()
    a.output.mkdir(parents=True,exist_ok=True);a.components.mkdir(parents=True,exist_ok=True)
    index=json.loads((a.source/'registry.json').read_text())
    with tempfile.TemporaryDirectory(prefix='crednexus-onnx-') as td:
        for target in index:
            src=a.source/target;dst=a.output/target;dst.mkdir(exist_ok=True);part=a.components/target;part.mkdir(exist_ok=True)
            schema=json.loads((src/'schema.json').read_text());registry=json.loads((src/'registry.json').read_text());classification=registry['task_type']=='classification'
            graph=Graph(schema);predictions=[]
            for (algorithm,info),weight in zip(registry['models'].items(),registry['weights']):
                model=load_native(algorithm,src/algorithm/info['path'],classification)
                component=Graph(schema);out=add_model(component,algorithm,model,schema,Path(td),classification)
                component.save(part/(algorithm+'.onnx'),out,{'target':target,'algorithm':algorithm,'classification':classification,'normalization':info['normalization']})
                if weight>0:
                    value=add_model(graph,algorithm,model,schema,Path(td),classification)
                    if not classification:value=graph.op('Max',graph.op('Mul',value,scale(graph,target,info['normalization'])),graph.const(0.,np.float64))
                    predictions.append(graph.binary('Mul',value,weight))
                del model
            out=predictions[0]
            for value in predictions[1:]:out=graph.op('Add',out,value)
            calibration=registry.get('calibration')
            if classification and calibration:
                probability=graph.op('Clip',out,graph.const(1e-6,np.float64),graph.const(1-1e-6,np.float64))
                logodds=graph.op('Log',graph.op('Div',probability,graph.op('Sub',graph.const(1.,np.float64),probability)))
                out=graph.op('Sigmoid',graph.binary('Add',graph.binary('Mul',logodds,calibration['slope']),calibration['intercept']))
            graph.save(dst/'model.onnx',out,{'target':target,'categories':schema['categories'],'weights':registry['weights'],'calibration_embedded':bool(calibration),'synthetic_data_only':True})
            json_dump(dst/'schema.json',schema);json_dump(dst/'registry.json',registry)
            print('Exported',target,(dst/'model.onnx').stat().st_size,flush=True)
    json_dump(a.output/'registry.json',{target:target+'/model.onnx' for target in index})
    json_dump(a.output/'training_run.json',json.loads((a.source/'run.json').read_text()))
    for name in ['deployment_policy.json','selected_model_metrics.json','interval_metrics.json']:
        if (a.source/name).exists():json_dump(a.output/name,json.loads((a.source/name).read_text()))
        elif (a.output/name).exists():(a.output/name).unlink()
    json_dump(a.output/'export_manifest.json',{'opset':18,'ai.onnx.ml':5,'ir_version':10,'device':'CPU',
        'versions':{p:importlib.metadata.version(p) for p in ['onnx','onnxruntime','catboost','lightgbm','xgboost']},
        'native_model_sha256':{target:{name:hashlib.sha256((a.source/target/name/info['path']).read_bytes()).hexdigest()
            for name,info in json.loads((a.source/target/'registry.json').read_text())['models'].items()} for target in index}})
    # Verification belongs to the exported bytes and must be rerun after export.
    if (a.output/'verification.json').exists():(a.output/'verification.json').unlink()
    if (a.output/'examples.json').exists():
        from .onnx_inference import OnnxPredictor
        examples=json.loads((a.output/'examples.json').read_text())
        for target in index:
            case=examples['scoring' if target.startswith('default') else 'forecast']
            case['expected'][target]=OnnxPredictor(a.output,target).predict(pd.DataFrame(case['rows'])).tolist()
        json_dump(a.output/'examples.json',examples)
    refresh_checksums(a.output)


if __name__=='__main__':main()
