# Experimental structures behind the channel lens

The animated membrane cartoons use simplified geometry to make selective
permeation, opening, and inactivation legible. The optional structure lens
contains **real experimental Cα coordinates**, independently of that
animation. No gating trajectory is inferred from these snapshots.

## Sources and states

| Lesson channel | Experimental reference | State and scope |
| --- | --- | --- |
| Fast Na⁺ | Human NaV1.5, [PDB 9P24](https://www.rcsb.org/structure/9P24), single-particle cryo-EM, 3.48 Å | Intermediate-open snapshot. The source paper discusses detergent-assisted stabilization; this is not an unperturbed native-state movie. One α chain contains four homologous domains. |
| L-type Ca²⁺ | Human CaV1.2 complex, [PDB 8HLP](https://www.rcsb.org/structure/8HLP), single-particle cryo-EM, 3.50 Å | Apo, inactivated conformation with a closed intracellular gate. Includes α1C, extracellular α2δ1 and cytoplasmic β2. The structure supplies architectural detail for the cartoon, not an open-state geometry. |
| Delayed K⁺ | Human KCNQ1–KCNE1–CaM, [PDB 9UC8](https://www.rcsb.org/structure/9UC8), single-particle cryo-EM, 3.36 Å | PIP₂-bound open complex, representing **I_Ks specifically**. The lesson combines simplified delayed outward K⁺ currents; this structure is not hERG/I_Kr. Four pore-forming KCNQ1 subunits, four KCNE1 fragments, and four calmodulins are retained. |

Primary publications:

- Biswas R, et al. *Structural and functional mechanisms underlying activation gate dynamics and IFM motif accessibility in human NaV1.5.* Nature Communications (2026). https://doi.org/10.1038/s41467-026-69672-x
- Wei Y, et al. *Structural bases of inhibitory mechanism of CaV1.2 channel inhibitors.* Nature Communications (2024). https://doi.org/10.1038/s41467-024-47116-8 ; open full text: https://pmc.ncbi.nlm.nih.gov/articles/PMC10981686/
- Zhong L, et al. *Secondary structure transitions and dual PIP2 binding define cardiac KCNQ1-KCNE1 channel gating.* Cell Research (2025). https://doi.org/10.1038/s41422-025-01182-9

These are cryo-EM structures, not crystal structures. PDB archive coordinate
data are distributed under CC0; the structure IDs, original publications and
RCSB PDB attribution are retained. See https://www.rcsb.org/pages/policies.
The visualization uses coordinates directly and does not reproduce a paper
figure or RCSB screenshot.

## Asset and reproducibility

Run from the repository root:

```sh
python scripts/prepare-channel-structures.py --download
```

Python and NumPy are required. The raw mmCIF files are cached under the system
temporary directory; they are not included in the website. To use an existing
download directory, pass `--source-dir /path/to/files`.

The script downloads `https://files.rcsb.org/download/{PDB_ID}.cif` and
requires these exact SHA-256 hashes before parsing:

| PDB | Source SHA-256 |
| --- | --- |
| 9P24 | `2f6a217a00ccb826cc6631808a27bbe8f731223774e577363b353de51fe28b69` |
| 8HLP | `f788265ab0d3bc59940cab5e15d2368db586be7f5d340a789522e3d7d1888a27` |
| 9UC8 | `53dd48f8063fba8dc6cc04242a27253fd7d09fdc3574986f3547bf037cee71d2` |

Outputs are `dist/cardiac-voltage/data/channel-structures.json` and the
source/assembly audit `data-source/channel-structures/provenance.json`.
The JSON contains **5,642 modeled residues** in about **151 KB**. Their counts
(1,258 / 2,332 / 2,052) agree with the source entries' modeled-residue counts.

## Geometry and assembly handling

- Biological assembly **1** is read from the deposited mmCIF, including its
  operation expressions. In these three files it uses the identity operation;
  9UC8 already includes all 12 protein chains. It is not a lone potassium
  subunit presented as a complete channel.
- Every resolved Cα is retained. Sequence gaps and adjacent Cα separations
  greater than 4.8 Å split the backbone into distinct segments; no bridging
  curve fills an unobserved loop. Author residue numbers and the resolved
  sequence are retained per segment.
- `secondary` is a string aligned with each segment's points: `H` denotes a
  deposited helix annotation, and `C` all remaining residues. It is not a new
  secondary-structure prediction. Per-chain `helices` retain author residue
  intervals.
- Ligands, lipid/detergent atoms, glycans, ions, and side chains are excluded
  from the displayed Cα representation. KCNE1's unresolved ends stay absent;
  only its deposited 39–68 fragment is shown.
- The only coordinate changes are a rigid rotation/translation and rounding
  to 0.01 Å. These are far smaller than the nominal map resolutions. The full
  source-to-viewer transform is retained in `orientation` and provenance.

## View orientation

The default display has **+Y toward the extracellular side**. This is a
geometric orientation inference, not an experimental fit of a bilayer:

- NaV1.5 uses the dominant axis of its deposited long pore-chain helices.
  Its orientation sign follows extracellular N-linked glycans versus resolved
  intracellular termini.
- CaV1.2 uses the direction from its intracellular S6-gate centroid to the
  EEEE selectivity-filter centroid. The 8HLP study explicitly identifies the
  four filter residues (E363, E706, E1135, E1464) and eight gate residues
  (L401, S405, L749, V753, V1182, I1186, F1519, I1523). This pore-specific
  axis is independent of long cytoplasmic helices. Its sign is cross-checked
  against extracellular α2δ1 and cytoplasmic β2. It differs from the general
  long-helix estimate by 2.21°, and from the filter-ring plane normal by
  3.82°. The residue IDs and validation measurements are retained in
  `orientation` and provenance.
- The KCNQ1 pore axis comes from planes through equivalent residues in the
  fourfold assembly. Its sign follows the extracellular pore-filter region
  versus cytoplasmic calmodulin.
- `poreCenter:[0,0,0]` is the centered orbit origin. It does **not** identify a
  measured ion binding site. `membraneY:null` deliberately avoids claiming an
  experimentally established membrane plane or thickness.
- `bounds` includes accessories. A viewer hiding accessories should fit the
  visible pore-chain coordinates, rather than the whole-complex bounds.

## Guidance for the educational cartoon

Use a four-part helical architecture around a selective central pore, with
outer voltage-sensing elements and an intracellular activation gate. For
NaV/CaV, those parts are domains of one main α chain; KCNQ1 has four separate
pore-forming subunits. Keep a clearly labeled ion pathway visible through a
cutaway instead of exposing every atomic detail.

NaV fast inactivation should be shown as a schematic intracellular IFM latch
or docking mechanism associated with gate closure, not a loose ball plugging
the middle of the pore. The exact molecular rearrangement remains more
complex than the cartoon. CaV inactivation has its own mechanisms and should
not reuse a labeled NaV IFM latch. The potassium cartoon should not imply
ATP-driven outward transport; channel permeation follows the electrochemical
driving force represented by the lesson.
