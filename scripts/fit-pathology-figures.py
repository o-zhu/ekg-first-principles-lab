#!/usr/bin/env python3
"""Inspectable twelve-lead residual figures for source-model fitting."""
from pathlib import Path
import argparse
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'data-source/pathology-fitting'
ORDER=[['I','aVR','V1','V4'],['II','aVL','V2','V5'],['III','aVF','V3','V6']]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case',required=True)
    parser.add_argument('--native',action='store_true')
    args=parser.parse_args()
    targets=json.loads((ROOT/'dist/data/pathology-fits/targets-v1.json').read_text())
    target=next(c for c in targets['cases'] if c['id']==args.case)
    if args.native:
        fit=json.loads((BASE/f'fit-{args.case}-native.json').read_text())
        selected=next(a for a in fit['approaches'] if a['id']==fit['selectedApproachId'])
        predicted=selected['ecg'];baseline=fit['approaches'][0]['ecg']
    else:
        fit=json.loads((ROOT/f'dist/data/pathology-fits/cases/{args.case}.json').read_text())
        selected=next(a for a in fit['approaches'] if a['id']==fit['selectedApproachId'])
        predicted=fit['ecg']['predicted'];baseline=fit['approaches'][0]['ecg']
    t=np.array(target['sampleGridMs'])
    folder=BASE/'figures';folder.mkdir(exist_ok=True)
    for zoom,window in [('full',target['analysisWindowMs']),('qrs',[-60,130])]:
        fig,axes=plt.subplots(3,4,figsize=(16,10),sharex=True)
        for row in range(3):
            for col in range(4):
                ax=axes[row,col];lead=ORDER[row][col]
                truth=np.array(target['samplesMv'][lead]);estimate=np.array(predicted[lead])
                ax.fill_between(t,target['iqrLowMv'][lead],target['iqrHighMv'][lead],color='#9da8b8',alpha=.25,label='Recorded beat IQR')
                ax.plot(t,target['samplesMv'][lead],color='#182236',lw=1.8,label='Recorded median')
                ax.plot(t,predicted[lead],color='#e14962',lw=1.8,label='Selected source model')
                ax.plot(t,baseline[lead],color='#bc8a30',lw=1,alpha=.65,label='Healthy source prior')
                ax.axhline(0,color='#b8c0cd',lw=.65)
                ax.axvline(0,color='#a4a7b4',lw=.7,ls=':')
                ax.set_xlim(*window);mask=(t>=window[0])&(t<=window[1])
                rmse=np.sqrt(np.mean((truth[mask]-estimate[mask])**2))
                ax.set_title(f'{lead}  |  RMSE {rmse:.3f} mV',loc='left',fontsize=11)
                ax.grid(alpha=.12)
                if col==0:ax.set_ylabel('mV')
                if row==2:ax.set_xlabel('Time from QRS anchor (ms)')
                ax.spines[['top','right']].set_visible(False)
        handles,labels=axes[0,0].get_legend_handles_labels()
        fig.legend(handles,labels,loc='upper center',ncol=4,bbox_to_anchor=(.5,.956),frameon=False)
        fig.suptitle(f'{target["title"]}\n{selected["label"]} · generic CT anatomy, fitted source physiology',fontsize=16,y=.995)
        fig.tight_layout(rect=[0,0,1,.92])
        file=folder/f'{args.case}-{("native-" if args.native else "")}{zoom}.png'
        fig.savefig(file,dpi=160);plt.close(fig)
        print(file)


if __name__=='__main__':main()
