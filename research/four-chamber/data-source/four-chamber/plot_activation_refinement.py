#!/usr/bin/env python3
"""Plot retained calculated traces without filtering, scaling, or alignment."""
from pathlib import Path
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'dist/data'
d = json.loads((DATA / 'qrs-activation-refinement.json').read_text())
t = np.asarray(d['timeMs'])
before = np.asarray(d['beforeLeadII'])
after = np.asarray(d['updatedLeadII'])

plt.rcParams.update({'font.size': 11, 'font.family': 'DejaVu Sans'})
fig, axes = plt.subplots(2, 1, figsize=(11.4, 8.2),
                         gridspec_kw={'height_ratios': [1, 1.55]},
                         facecolor='#fafaf6')
for ax in axes:
    ax.set_facecolor('#fafaf6')
    ax.plot(t, before, color='#b96b6b', linewidth=1.8,
            label='Previous: four isolated delivery sites')
    ax.plot(t, after, color='#247d68', linewidth=2.5,
            label='Updated: twelve sites across four regions')
    ax.axhline(0, color='#7c8882', linewidth=.6, alpha=.6)
    ax.grid(alpha=.14)
    ax.spines[['right', 'top']].set_visible(False)
    ax.set_ylabel('Calculated lead II (mV)')
    ax.set_xlabel('Shared model time (ms)')
    ax.set_ylim(-.4, 1.4)
axes[0].set_xlim(0, 1000)
axes[0].legend(loc='upper right', frameon=False, fontsize=10)
axes[0].set_title('Complete cardiac cycle', loc='left', fontsize=12)
axes[1].set_xlim(195, 285)
axes[1].set_title('QRS detail · secondary-peak prominence 0.404 → 0.096 mV',
                  loc='left', fontsize=12)
fig.suptitle('Regional activation produces a more dominant R peak',
             fontsize=18, x=.085, ha='left', y=.985, color='#214b3d')
fig.text(.085, .943,
         'Same anatomy, 330,758 source sites, APs and electrical forward operator.',
         color='#64766d', fontsize=11)
fig.text(.085, .014,
         'Literature-informed model scenario chosen to reduce an exaggerated notch. '
         'A residual shoulder remains.\n'
         'Both curves use their original clock; no post-hoc waveform filter, '
         'voltage gain fit, or measured ECG insertion.',
         color='#64766d', fontsize=10, linespacing=1.6)
fig.tight_layout(rect=[.035, .071, .99, .925], h_pad=2.3)
destination = DATA / 'qrs-refinement-comparison.png'
fig.savefig(destination, dpi=180)
print(destination)
