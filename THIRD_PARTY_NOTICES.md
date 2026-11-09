# Third-party notices and license boundaries

The root [MIT license](LICENSE) covers the original EKG Lab software and original documentation, copyright © 2026 **o-zhu**. It does **not** replace the licenses on anatomy, recordings, models, fonts, figures, or incorporated third-party software. This document applies equally to files in Git and corresponding files supplied in the versioned asset and research downloads.

The [source catalog](data/asset-sources.json) maps file groups to source identities and license evidence. The [asset manifest](data/asset-manifest.json) records individual distributable files and checksums. Scientific citations and their role in the project appear in [References](docs/REFERENCES.md). Preserve those source records and the notices below when redistributing source assets or derivatives.

## Software and fonts

| Component | Included location | License and credit |
| --- | --- | --- |
| Three.js **r180**, including `OrbitControls`, `GLTFLoader`, and `BufferGeometryUtils` | `dist/vendor/` | MIT; copyright © 2010–2025 three.js authors. [Complete notice](licenses/Three.js-MIT.txt); the original notice also remains beside the vendored files. |
| OrganUI heart preparation | Original heart GLB and its preparation attribution in `dist/models/` | Original preparation: OrganUI, pinned [source commit](https://github.com/organui/heart-3d/tree/c72ce6654ff8e282942f97750d3104f55ef4fc3d). Upstream software is MIT, copyright © 2026 OrganUI contributors; [complete notice](licenses/OrganUI-MIT.txt). The anatomical mesh has the separate BodyParts3D license below. |
| DM Sans | Two local WOFF2 subsets in `dist/cardiac-voltage/assets/fonts/` | SIL Open Font License 1.1; copyright 2014 The DM Sans Project Authors. [Complete notice](licenses/DM-Sans-OFL-1.1.txt), [upstream](https://github.com/googlefonts/dm-fonts). |
| Instrument Serif | Four local WOFF2 subsets in the same directory | SIL Open Font License 1.1; copyright 2022 The Instrument Serif Project Authors. [Complete notice](licenses/Instrument-Serif-OFL-1.1.txt), [upstream](https://github.com/Instrument/instrument-serif). |
| Historical LLNL geometry notices | `dist/cardiac-voltage/data/GEOMETRY_*` and `heart-geometry-*` | MIT, copyright © 2023 Lawrence Livermore National Security, LLC. [Complete license](licenses/LLNL-MIT.txt) and [DOE/LLNL notice](licenses/LLNL-NOTICE.txt). These retained historical notices do not license the current four-chamber CT model. |

Font subsets are redistributed unchanged. Their exact source URLs and hashes are retained in [font provenance](dist/cardiac-voltage/assets/fonts/provenance.json). Font software may be bundled with the application under OFL; it remains OFL and may not be sold by itself. No claim of endorsement by any upstream contributor is made.

## Reference anatomy: BodyParts3D

> BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International.

**Source:** [BodyParts3D official archive](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html), version **4.0**, released 2013-05-16, IS-A OBJ archive at polygon reduction rate 99%. The retained source attribution records an official download on 2026-09-22. The [official license page](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html), updated 2025-02-27, grants [CC BY 4.0](licenses/CC-BY-4.0.txt).

This applies to the heart, chest bones, cropped skin, derivative levels of detail, anatomical label maps, and any images that reproduce them. See [model attribution](dist/models/ATTRIBUTION.md), [heart manifest](dist/models/heart-manifest.json), and [chest manifest](dist/models/chest-manifest.json).

OrganUI selected and grouped source meshes, triangulated faces, recentered and uniformly scaled coordinates, changed Z-up to Y-up, recomputed smooth normals, applied illustrative colors, and converted OBJ to GLB. EKG Lab retains that original heart GLB and adds registered chest structures, reduced-detail variants, modeled seam collars, teaching pathways, colors, sectioning, and stylized movement. These additions are not recovered patient physiology. Keep the applicable modification descriptions with derived assets.

The old OBJ headers referred to **CC BY-SA 2.1 Japan** and linked the official archive license URL. The incorporated model's provenance explicitly relies on the archive's later **CC BY 4.0** grant for directly downloaded assets. The legacy header discrepancy is preserved; this release does not assert that all copies obtained from other sources have identical terms. The inherited attribution refers to an upstream `docs/MODEL_PROVENANCE.md` and dated source snapshots that were **not present in the recovered EKG Lab snapshot**. The current official license was checked for this release; the supplied manifests and this notice are the available evidence here.

The upstream research citation is Mitsuhashi et al., *BodyParts3D: 3D structure database for anatomical concepts* (2009), [doi:10.1093/nar/gkn613](https://doi.org/10.1093/nar/gkn613).

## Four-chamber CT geometry and modeled derivatives

**Rodero et al. (2021), Virtual cohort of extreme and average four-chamber heart meshes from statistical shape model**, version 1.0.0, [doi:10.5281/zenodo.4593739](https://doi.org/10.5281/zenodo.4593739), is licensed **CC BY 4.0**. The current scientific runtime model, its native CT/source geometry, fitting geometry, and associated research files derive from this dataset. Preserve the [full attribution and change notice](dist/cardiac-voltage/data/four-chamber-geometry-attribution.txt) and [license](licenses/CC-BY-4.0.txt).

The source is a statistical mean derived from CT-based hearts. EKG Lab extracts myocardium, sections and reduces display surfaces, retains source-coordinate/interpolation mappings, and adds modeled activation, recovery, torso lead fields, and educational deformations. The appended left atrial appendage body is **inferred**, using the native attachment boundary; it is not missing measured anatomy recovered from the source. Fitted physiology and ECGs are new modeling results, not the original dataset authors' validated outputs. The recorded ECGs and optical preparations come from other people.

## Human optical recordings and cellular model

**Human optical recordings.** The dataset accompanying Smirnov et al., *Genetic algorithm-based personalized models of human cardiac action potential* (2020), [doi:10.1371/journal.pone.0231695](https://doi.org/10.1371/journal.pone.0231695), is available at [Dryad doi:10.5061/dryad.stqjq2c09](https://doi.org/10.5061/dryad.stqjq2c09), mirrored as [Zenodo 3986725](https://zenodo.org/records/3986725), under **CC0 1.0**. The dataset credits Roman Syunyaev, Igor Efimov, Kedar Aras, Anna Gams, Aaron Koppel, Oleg Gusev, Andrey Pikunov, and Ruslan Deviatiiarov. The [CC0 text](licenses/CC0-1.0.txt) is retained. Scientific acknowledgment is requested separately from copyright obligations.

Included movies, masks, timing maps, backgrounds, and ventricular templates are processed derivatives. See the [optical README](dist/cardiac-voltage/data/human/README.md) and donor metadata for exact input hashes, filtering, normalization, sample timing, and limitations. The measured quantity is normalized optical fluorescence, not calibrated intracellular millivolts; assigning its shape to another anatomy is modeling.

**Atrial CellML model.** The bundled Courtemanche–Ramirez–Nattel CellML file and generated Python in the scientific source archive come from [this Physiome exposure](https://models.cellml.org/exposure/0e03bbe01606be5811691f9d5de10b65), changeset `c26e4d53792b0e3161b2f8638afa2819fc999610`, obtained 2026-10-29. The [specific license page](https://models.cellml.org/exposure/0e03bbe01606be5811691f9d5de10b65/courtemanche_ramirez_nattel_1998.cellml/license_citation) grants **CC BY 3.0 Unported**; [complete text](licenses/CC-BY-3.0.txt). Credit **Penny Noble**, the CellML implementation author, and **Marc Courtemanche, Rafael J. Ramirez, Stanley Nattel**, authors of the mathematical model, [doi:10.1152/ajpheart.1998.275.1.H301](https://doi.org/10.1152/ajpheart.1998.275.1.H301). Original model metadata are retained. The published implementation was paced by the project's solver wrapper; its numerical templates are model output, not measured human atrial AP recordings.

**TT06 boundary.** The optional research wrapper references the ten Tusscher–Panfilov 2006 implementation at [PMR exposure 80d](https://models.cellml.org/e/80d). Its retained provenance says that implementation's license was unspecified. The third-party implementation is **not redistributed**: the package contains the original retrieval/solver wrapper and numerical output. Users wishing to rerun that alternative must obtain the implementation from the upstream location and review its terms. This omission does not prevent running the supplied website or precomputed models. Do not describe the absent implementation as MIT.

## Clinical ECG recordings

These are excerpts or derived beat ensembles from publicly licensed research datasets. Original record IDs, sample rate, calibration, selection, and transformations are retained in the adjacent provenance files. Educational labels and fitted mechanisms must remain distinguishable from original annotations. A public dataset license does not authorize adding unrelated private clinical records.

| Dataset | Included use | License and attribution |
| --- | --- | --- |
| [PTB-XL 1.0.3](https://physionet.org/content/ptb-xl/1.0.3/) | Base/extra clinical library, retained native RBBB source, fitted targets/cases | **CC BY 4.0**. Wagner, Strodthoff, Bousseljot, Samek, Schaeffter (2022), [doi:10.13026/kfzx-aw45](https://doi.org/10.13026/kfzx-aw45); original paper [doi:10.1038/s41597-020-0495-6](https://doi.org/10.1038/s41597-020-0495-6). |
| [PTB-XL+ 1.0.1](https://physionet.org/content/ptb-xl-plus/1.0.1/) | Automated-feature cross-check for record 03155 | **CC BY 4.0**. Strodthoff et al. (2023), [doi:10.13026/g6h6-7g88](https://doi.org/10.13026/g6h6-7g88). Automated features are not expert ground-truth delineations. |
| [PTB Diagnostic ECG Database 1.0.0](https://physionet.org/content/ptbdb/1.0.0/) | `patient104/s0306lre`, calibration reference and retained research source | **ODC-By 1.0**. Michael Oeff, Hans Koch, Ralf Bousseljot, Dieter Kreiseler and contributors; PhysioNet; [doi:10.13026/C28C71](https://doi.org/10.13026/C28C71). |
| [MIT-BIH Arrhythmia Database 1.0.0](https://physionet.org/content/mitdb/1.0.0/) | Records 231, 202, 222, 209 and derived modeled comparisons | **ODC-By 1.0**. George Moody, Roger Mark and contributors; PhysioNet; [doi:10.13026/C2F305](https://doi.org/10.13026/C2F305). |
| [MIT-BIH Malignant Ventricular Ectopy Database 1.0.0](https://physionet.org/content/vfdb/1.0.0/) | Records 421 and 422 | **ODC-By 1.0**. MIT-BIH/PhysioNet database contributors; [doi:10.13026/C22P44](https://doi.org/10.13026/C22P44). |
| [Sudden Cardiac Death Holter Database 1.0.0](https://physionet.org/content/sddb/1.0.0/) | Record 47 torsades excerpt | **ODC-By 1.0**. Scott Greenwald and contributors; PhysioNet; [doi:10.13026/C2W306](https://doi.org/10.13026/C2W306). |
| [Lobachevsky University ECG Database 1.0.1](https://physionet.org/content/ludb/1.0.1/) | Record 21 and derived comparison | **ODC-By 1.0**. Alena Kalyakulina, Igor Yusipov, Viktor Moskalenko, Alexander Nikolskiy, Konstantin Kosonogov, Nikolai Zolotykh, Mikhail Ivanchenko (2021); [doi:10.13026/eegm-h675](https://doi.org/10.13026/eegm-h675). |
| [ACS ECG dataset, Figshare 29925314 v1](https://doi.org/10.6084/m9.figshare.29925314.v1) | ACS 00004/18206 STEMI excerpts and derived fits | **CC0 1.0**, as recorded by the [dataset API](https://api.figshare.com/v2/articles/29925314). Xinyue Du, Ying Liu, Lingli Wang, Wenyi He, Guangyu Bin, Guolan Deng, Jiayue Yang. |

For ODC-By material, the notice is: **Contains information from the named database, made available by its contributors through PhysioNet under the Open Data Commons Attribution License v1.0.** Preserve the named database, DOI, [complete ODC-By license](licenses/ODC-By-1.0.txt), and changes/source-record metadata. For CC BY material, preserve the creator/source and license link, and identify excerpting, unit conversion, baseline subtraction, averaging, or other changes. ODC-By addresses database rights; no independent license over unrelated documents or imagery is implied.

The ACS **dataset** license is distinct from the associated Scientific Data **article**, which is CC BY-NC-ND 4.0. This release redistributes the licensed dataset excerpts and original processing; it does not include the article or its figures. A citation to the article does not relicense those materials.

## Experimental protein structures

The optional channel and pharmacology lenses use coordinate-derived JSON from the **PDB archive**, whose [RCSB usage policy](https://www.rcsb.org/pages/policies) identifies **CC0 1.0** for the archive's data files. They are custom coordinate visualizations, not copied RCSB screenshots or paper figures. Preserve accession IDs, original structure citations, source hashes, and inferred-orientation labels as scientific provenance.

- Channel lens: **9P24** (human NaV1.5), **8HLP** (human CaV1.2 complex), **9UC8** (KCNQ1–KCNE1–calmodulin).
- Pharmacology lens: **6LQA**, **6UZ0**, **7FBS**, **6JPA**, **6JPB**, **7DDH**, **6D9H**, **5VA1**.

See [channel source documentation](data-source/channel-structures/README.md), its [provenance](data-source/channel-structures/provenance.json), and each pharmacology JSON's `sourceUrl`, `sourceSha256`, species, construct, state, and limitations. Some are nonhuman homologs or engineered constructs. Static experimental coordinates do not establish the animated binding or gating trajectory.

## Microscopy images

| File in `dist/cardiac-voltage/assets/microscopy/` | Credit, terms, and modifications |
| --- | --- |
| `cardiac-muscle-light-200x.jpg` | Berkshire Community College Bioscience Image Library (2018), *Muscle Tissue: Intercalated Discs in Cardiac Muscle*. **CC0 1.0**, [source and original-license review](https://commons.wikimedia.org/wiki/File:Muscle_Tissue_Intercalated_Discs_in_Cardiac_Muscle_(27061947267).jpg). Original JPEG retained. The source does not provide species/stain certainty or a calibrated scale bar. |
| `cardiac-gap-junction-tem.jpg` | Michael Dykstra, *National Toxicology Program Rodent Ultrastructure Atlas*, Muscle, Figure 6; [atlas](https://ntp.niehs.nih.gov/atlas/us/musculoskeletal-system/muscle), [doi:10.22427/NTP-OTHER-1006](https://doi.org/10.22427/NTP-OTHER-1006). **Public domain under the [NTP website policy](https://ntp.niehs.nih.gov/support/policies)**, which permits copying/distribution when no copyright is indicated; no separate copyright mark was identified for this figure. Embedded JPEG extracted losslessly from the supplied PDF; original labels and 500 nm scale bar retained. |
| `purkinje-rabbit-confocal-romero-fig2.png` | © 2016 **Daniel Romero, Oscar Camara, Frank Sachse, Rafael Sebastian**, *Analysis of Microstructure of the Cardiac Conduction System Based on Three-Dimensional Confocal Microscopy*, PLOS ONE 11(10):e0164093, **Figure 2**, [figure DOI](https://doi.org/10.1371/journal.pone.0164093.g002). **CC BY 4.0**. Publisher PNG retained unchanged with labels/scale. This is rabbit microscopy and its reconstructions, not human tissue. |

The [image provenance](dist/cardiac-voltage/assets/microscopy/provenance.json) retains original URLs, hashes, file sizes, captions, transformations, and interpretation limits. Screenshots or videos containing these images must carry the corresponding credits.

## Release screenshot

[`docs/media/lead-explorer.jpg`](docs/media/lead-explorer.jpg) is an original
capture of the v22 live Module 3 display by o-zhu's EKG Lab release. It shows
BodyParts3D anatomy, © DBCLS, CC BY 4.0, prepared by OrganUI. Membrane coloring
uses the project's Rodero/optical/Courtemanche-derived reference field described
above; the visible teaching ECG is synthetic. Keep those anatomy/data credits
with reused images. The capture used Chrome's software 3D fallback and is not
evidence of hardware WebGL performance. Three.js and the fonts are credited as
software assets above; their licenses do not independently license the raster
screenshot output.

## Packaging and redistribution

Keep this document and the `licenses/` directory with redistributed asset packs, research archives, or substantial portions of the application. The two retained scientific ZIPs contain multiple separately licensed components; the archive filename is not a single license declaration. The source catalog describes their constituent sources. Original software surrounding an asset remains separately licensed.

No upstream dataset author, university, institute, government agency, PhysioNet, DBCLS, RCSB PDB, or OrganUI is represented as endorsing EKG Lab. Citations are scholarly acknowledgment and do not establish independent validation of the educational simulations.
