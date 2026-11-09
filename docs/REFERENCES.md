# References and scientific provenance

This document connects the sources actually used by EKG Lab to the assets and
methods they support. It is not a claim that those authors validated this
application. Cite the software using [CITATION.cff](../CITATION.cff), and cite the
relevant upstream data or models when reusing them. Copyright obligations are
separate and appear in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

## Read the evidence correctly

| Evidence in the application | What it establishes | What it does not establish |
| --- | --- | --- |
| BodyParts3D reference anatomy and Rodero statistical-mean CT meshes | Source anatomical surfaces and mesh coordinates, within each source's limits | A single shared subject, current patient anatomy, or validated deformation |
| Human optical maps and clinical ECG excerpts | Measurements from the stated preparations/records, with documented processing | Simultaneous measurements from the displayed whole-heart anatomy |
| Published CellML models and experimental protein structures | Specified equations or static experimental coordinates | Measured tissue APs for every colored site, gating trajectories, or predicted drug response |
| Teaching paths, tissue fields, motion, electrolyte curves, and fitted mechanisms | Explicit educational hypotheses and computed consequences | A unique inverse solution, inferred infarct truth, or clinical validation |

The source-specific methods retain units, transforms, sampling, calibration,
selection, and parameter assumptions. None of the sources makes EKG Lab a
clinical diagnostic or treatment system.

## Anatomy and optical recordings

1. **Mitsuhashi N, Fujieda K, Tamura T, Kawamoto S, Takagi T, Okubo K (2009).** *BodyParts3D: 3D structure database for anatomical concepts.* Nucleic Acids Research 37:D782–D785. [doi:10.1093/nar/gkn613](https://doi.org/10.1093/nar/gkn613). Supplies the reference anatomy in Modules 2–6. The incorporated archive is BodyParts3D **4.0**, with original heart preparation by [OrganUI](https://github.com/organui/heart-3d/tree/c72ce6654ff8e282942f97750d3104f55ef4fc3d). [Model provenance and changes](../dist/models/ATTRIBUTION.md).
2. **Rodero C, Strocchi M, Marciniak M, et al. (2021).** *Linking statistical shape models and simulated function in the healthy adult human heart.* PLOS Computational Biology 17(4):e1008851. [doi:10.1371/journal.pcbi.1008851](https://doi.org/10.1371/journal.pcbi.1008851). Dataset: *Virtual cohort of extreme and average four-chamber heart meshes from statistical shape model*, v1.0.0, [doi:10.5281/zenodo.4593739](https://doi.org/10.5281/zenodo.4593739). Supplies the CT-derived statistical-average geometry for Module 1 and the fitted forward-model views. [Attribution and inferred LAA changes](../dist/cardiac-voltage/data/four-chamber-geometry-attribution.txt).
3. **Smirnov D, Pikunov A, Syunyaev R, et al. (2020).** *Genetic algorithm-based personalized models of human cardiac action potential.* PLOS ONE 15(5):e0231695. [doi:10.1371/journal.pone.0231695](https://doi.org/10.1371/journal.pone.0231695). The data DOI was corrected in [doi:10.1371/journal.pone.0244687](https://doi.org/10.1371/journal.pone.0244687). The optical dataset is credited to **Syunyaev R, Efimov I, Aras K, Gams A, Koppel A, Gusev O, Pikunov A, Deviatiiarov R**, [Dryad doi:10.5061/dryad.stqjq2c09](https://doi.org/10.5061/dryad.stqjq2c09), mirrored at [Zenodo 3986725](https://zenodo.org/records/3986725). EKG Lab processes the two LV preparations, not fourteen complete optical datasets. [Processing, masks, units and limits](../dist/cardiac-voltage/data/human/README.md).
4. **Boukens BJ, Sulkin MS, Gloschat CR, Ng FS, Vigmond EJ, Efimov IR (2015).** *Transmural APD gradient synchronizes repolarization in the human left ventricular wall.* Cardiovascular Research 108(1):188–196. [doi:10.1093/cvr/cvv202](https://doi.org/10.1093/cvr/cvv202). Provides published endpoint timing values for the simplified strand lesson. EKG Lab interpolates between rounded group means and specifies its own AP shape; it does not reproduce individual experimental traces. [Wave model notes](../dist/cardiac-voltage/data/WAVE_MODEL_NOTES.md).

## Clinical recordings and their versions

| Resource | Dataset citation and original study | Use in EKG Lab |
| --- | --- | --- |
| PTB-XL **1.0.3** | Wagner P, Strodthoff N, Bousseljot R, Samek W, Schaeffter T (2022), [doi:10.13026/kfzx-aw45](https://doi.org/10.13026/kfzx-aw45). Wagner P et al. (2020), *PTB-XL, a large publicly available electrocardiography dataset*, Scientific Data 7:154, [doi:10.1038/s41597-020-0495-6](https://doi.org/10.1038/s41597-020-0495-6). | Base and extra clinical cases; complete-RBBB record 03155 and other fitted comparisons. |
| PTB-XL+ **1.0.1** | Strodthoff N et al. (2023), *PTB-XL+, a comprehensive electrocardiographic feature dataset*, [dataset doi:10.13026/g6h6-7g88](https://doi.org/10.13026/g6h6-7g88), Scientific Data 10:279, [doi:10.1038/s41597-023-02153-8](https://doi.org/10.1038/s41597-023-02153-8). | Automatic features for record 03155, used as a cross-check rather than expert ground truth. |
| PTB Diagnostic ECG Database **1.0.0** | Bousseljot R, Kreiseler D, Schnabel A (1995), *Nutzung der EKG-Signaldatenbank CARDIODAT der PTB über das Internet*, Biomedizinische Technik 40(Suppl. 1):317. [Dataset doi:10.13026/C28C71](https://doi.org/10.13026/C28C71). | `patient104/s0306lre`, the separately recorded healthy lead-II calibration reference. |
| MIT-BIH Arrhythmia Database **1.0.0** | Moody GB, Mark RG (2001), *The impact of the MIT-BIH Arrhythmia Database*, IEEE Engineering in Medicine and Biology Magazine 20(3):45–50, [doi:10.1109/51.932724](https://doi.org/10.1109/51.932724). [Dataset doi:10.13026/C2F305](https://doi.org/10.13026/C2F305). | Records 231, 202, 222 and 209 for AV block and supraventricular rhythm examples. |
| MIT-BIH Malignant Ventricular Ectopy Database **1.0.0** | [PhysioNet dataset doi:10.13026/C22P44](https://doi.org/10.13026/C22P44). | Records 421 and 422, ventricular tachycardia/fibrillation excerpts. |
| Sudden Cardiac Death Holter Database **1.0.0** | Greenwald S and contributors, [PhysioNet dataset doi:10.13026/C2W306](https://doi.org/10.13026/C2W306). Lerma C, Lee CF, Glass L, Goldberger AL (2007), *The rule of bigeminy revisited: analysis in sudden cardiac death syndrome*, Journal of Electrocardiology 40(1):78–88, [doi:10.1016/j.jelectrocard.2006.04.011](https://doi.org/10.1016/j.jelectrocard.2006.04.011). | Record 47; the cited study supports identification of the selected torsades passage. |
| Lobachevsky University ECG Database **1.0.1** | Kalyakulina A et al. (2021), [dataset doi:10.13026/eegm-h675](https://doi.org/10.13026/eegm-h675). Kalyakulina AI et al. (2020), *LUDB: A New Open-Access Validation Tool for Electrocardiogram Delineation Algorithms*, IEEE Access 8:186181–186190, [doi:10.1109/ACCESS.2020.3029211](https://doi.org/10.1109/ACCESS.2020.3029211). | Record 21 and its supplied annotations. |
| ACS dataset, Figshare **29925314 v1** | Du X, Liu Y, Wang L, et al., [dataset doi:10.6084/m9.figshare.29925314.v1](https://doi.org/10.6084/m9.figshare.29925314.v1). Du X et al. (2026), *A large-scale 12-lead electrocardiogram dataset for acute coronary syndrome prediction containing 19,955 ECGs*, Scientific Data 13:1009, [doi:10.1038/s41597-026-07278-0](https://doi.org/10.1038/s41597-026-07278-0). | Records ACS00004 and ACS18206. Dataset CC0 terms are distinct from the article's CC BY-NC-ND terms. |

The resource pages currently request the platform citation: **Pollard T, Moody
BE, Lehman LH, et al. (2026), *PhysioNet as a global platform for biomedical
research*, Nature Health 1:792–795**, [doi:10.1038/s44360-026-00096-z](https://doi.org/10.1038/s44360-026-00096-z).

Record-level provenance, verification and transformations remain in
[`dist/data/`](../dist/data/) and the [target preparation methods](../dist/data/pathology-fits/TARGET_METHODS.md).
The public recording is distinct from the reconstructed mechanism displayed
beside it. An association with a later angiographic culprit is not simultaneous
validation of a modeled electrical injury map.

## Cell models, activation, and forward calculation

- **Courtemanche M, Ramirez RJ, Nattel S (1998).** *Ionic mechanisms underlying human atrial action potential properties: insights from a mathematical model.* American Journal of Physiology 275:H301–H321. [doi:10.1152/ajpheart.1998.275.1.H301](https://doi.org/10.1152/ajpheart.1998.275.1.H301). The actual CellML implementation is by **Penny Noble**, from [PMR exposure 0e03bbe01606be5811691f9d5de10b65](https://models.cellml.org/exposure/0e03bbe01606be5811691f9d5de10b65), changeset `c26e4d53792b0e3161b2f8638afa2819fc999610`, obtained 2026-10-29. It supplies a published human-data-based atrial waveform model, not a measured optical atrial trace.
- **Lloyd CM, Lawson JR, Hunter PJ, Nielsen PF (2008).** *The CellML Model Repository.* Bioinformatics 24(18):2122–2123. [doi:10.1093/bioinformatics/btn390](https://doi.org/10.1093/bioinformatics/btn390). Repository citation requested by the specific [model license/citation page](https://models.cellml.org/exposure/0e03bbe01606be5811691f9d5de10b65/courtemanche_ramirez_nattel_1998.cellml/license_citation).
- **ten Tusscher KHWJ, Panfilov AV (2006).** *Alternans and spiral breakup in a human ventricular tissue model.* American Journal of Physiology—Heart and Circulatory Physiology 291:H1088–H1100. [doi:10.1152/ajpheart.00109.2006](https://doi.org/10.1152/ajpheart.00109.2006). Supports optional research AP-shape comparisons. The third-party implementation at [PMR exposure 80d](https://models.cellml.org/e/80d) is not bundled because the retained source license was unspecified. Numerical outputs and an original retrieval/solver wrapper are provided.
- **Durrer D, van Dam RT, Freud GE, Janse MJ, Meijler FL, Arzbaecher RC (1970).** *Total excitation of the isolated human heart.* Circulation 41:899–912. [doi:10.1161/01.CIR.41.6.899](https://doi.org/10.1161/01.CIR.41.6.899). Historical activation-sequence evidence; it does not supply this application's subject-specific activation fields.
- **Ramanathan C, Jia P, Ghanem R, Ryu K, Rudy Y (2006).** *Activation and repolarization of the normal human heart under complete physiological conditions.* PNAS 103:6309–6314. [doi:10.1073/pnas.0601533103](https://doi.org/10.1073/pnas.0601533103). Informs activation/recovery hypotheses. ECGI recovery proxies are not full-wall intracellular AP measurements.
- **Stoks J et al. (2024).** *Variant patterns of electrical activation and recovery in normal human hearts revealed by noninvasive electrocardiographic imaging.* Europace 26:euae172. [doi:10.1093/europace/euae172](https://doi.org/10.1093/europace/euae172). Supports caution about between-person variation and nonunique reference recovery maps.
- **Gillette K et al. (2022).** *A personalized real-time virtual model of whole heart electrophysiology.* Frontiers in Physiology 13:907190. [doi:10.3389/fphys.2022.907190](https://doi.org/10.3389/fphys.2022.907190). Informs whole-heart/conduction-system and bundle-block mechanisms. EKG Lab's simplified graph and torso are not this study's personalized model.
- **Pezzuto S, Kal'avský P, Potse M, Prinzen FW, Auricchio A, Krause R (2017).** *Evaluation of a Rapid Anisotropic Model for ECG Simulation.* Frontiers in Physiology 8:265. [doi:10.3389/fphys.2017.00265](https://doi.org/10.3389/fphys.2017.00265). Background for efficient activation and ECG forward modeling; EKG Lab retains its own implementations and assumptions.
- **Villongco CT, Krummen DE, Stark P, Omens JH, McCulloch AD (2014).** *Patient-specific modeling of ventricular activation pattern using surface ECG-derived vectorcardiogram in bundle branch block.* Progress in Biophysics and Molecular Biology 115:305–313. [doi:10.1016/j.pbiomolbio.2014.06.011](https://doi.org/10.1016/j.pbiomolbio.2014.06.011). Illustrates model personalization and independent activation evidence that EKG Lab's source records do not contain.
- **Okada J et al. (2020).** *Ionic mechanisms of ST segment elevation in electrocardiogram during acute myocardial infarction.* Journal of Physiological Sciences 70:36. [doi:10.1186/s12576-020-00760-3](https://doi.org/10.1186/s12576-020-00760-3). Mechanistic context for resting/plateau gradients and ischemic ST changes. EKG Lab's regional injury parameters are qualitative/calibrated priors, not inferred ion concentrations or an identified infarct boundary.

The implemented homogeneous torso source integral, timing graph, template
interpolation, held-out beat splits, parameter bounds, and alternative fits are
documented in [Four-chamber methods](../dist/cardiac-voltage/data/FOUR_CHAMBER_METHODS.md),
[Lead-II calibration](../dist/cardiac-voltage/data/LEAD_II_CALIBRATION.md),
[Forward fit methods](../dist/data/pathology-fits/FORWARD_FIT_METHODS.md), and
[Regenerated fit methods](../dist/data/pathology-fits/REGENERATED_FIT_METHODS.md).
These local documents contain additional experiment-specific references.

## Lead systems and ECG interpretation

**Malmivuo J, Plonsey R (1995), *Bioelectromagnetism: Principles and Applications
of Bioelectric and Biomagnetic Fields*, Oxford University Press** provides the
source/volume-conductor and lead-system background: [Chapter 8](https://bem.fi/book/08/08.htm)
and [Chapter 15](https://bem.fi/book/15/15.htm). The ordinary teaching lead arrows
are geometric direction guides; they are not themselves the calculated FEM lead
fields of the separate CT forward model.

The application cites the **AHA/ACCF/HRS recommendations for the standardization
and interpretation of the electrocardiogram** for electrode placement and
measurement conventions:

- Kligfield P et al. (2007), Part I: electrocardiogram and its technology. [doi:10.1016/j.jacc.2007.01.024](https://doi.org/10.1016/j.jacc.2007.01.024).
- Surawicz B et al. (2009), Part III: intraventricular conduction disturbances. [doi:10.1016/j.jacc.2008.12.013](https://doi.org/10.1016/j.jacc.2008.12.013).
- Rautaharju PM et al. (2009), Part IV: ST segment, T and U waves, and QT interval. [doi:10.1016/j.jacc.2008.12.014](https://doi.org/10.1016/j.jacc.2008.12.014).
- Hancock EW et al. (2009), Part V: cardiac chamber hypertrophy. [doi:10.1016/j.jacc.2008.12.015](https://doi.org/10.1016/j.jacc.2008.12.015).
- Wagner GS et al. (2009), Part VI: acute ischemia/infarction. [doi:10.1016/j.jacc.2008.12.016](https://doi.org/10.1016/j.jacc.2008.12.016).

The retained in-app source collection in [`dist/references.js`](../dist/references.js)
links the additional rhythm guidelines, mechanical-motion studies, and clinical
interpretation references used in the lessons. This educational release does not
implement a complete current clinical guideline or diagnostic decision system.

## Electrolyte explorer

The explorer computes the explicitly specified Nernst and fixed-permeability
resting approximations. AP shapes, ECG amplitudes, and concentration-response
curves remain illustrative and separate. Its [methods](electrolyte-explorer.md)
and [implementation/source list](../dist/cardiac-voltage/electrolyte-model.js)
preserve the exact distinction.

| Source | Role and evidence boundary |
| --- | --- |
| Miura DS, Hoffman BF, Rosen MR (1977). *The effect of extracellular potassium on the intracellular potassium ion activity and transmembrane potentials of beating canine cardiac Purkinje fibers.* [doi:10.1085/jgp.69.4.463](https://doi.org/10.1085/jgp.69.4.463). | Direct microelectrode evidence in canine Purkinje tissue; context for equilibrium versus membrane voltage. |
| King et al. (2021). *The conduction velocity-potassium relationship in the heart is modulated by sodium and calcium.* [doi:10.1007/s00424-021-02537-y](https://doi.org/10.1007/s00424-021-02537-y). | Guinea-pig optical mapping and modeling; biphasic potassium–conduction context. |
| Pezhouman A et al. (2015). *Molecular Basis of Hypokalemia-Induced Ventricular Fibrillation.* [doi:10.1161/CIRCULATIONAHA.115.016217](https://doi.org/10.1161/CIRCULATIONAHA.115.016217). | Experimental/modeling mechanisms of hypokalemic instability, not a serum-to-waveform calibration. |
| Montague BT, Ouellette JR, Buller GK (2008). *Retrospective Review of the Frequency of ECG Changes in Hyperkalemia.* [doi:10.2215/CJN.04611007](https://doi.org/10.2215/CJN.04611007). | Human observational evidence against assigning a fixed ECG to each potassium value. |
| Grandi E, Pasqualini FS, Pes C, Corsi C, Zaza A, Severi S (2009). *Theoretical investigation of action potential duration dependence on extracellular Ca2+ in human cardiomyocytes.* [doi:10.1016/j.yjmcc.2008.12.002](https://doi.org/10.1016/j.yjmcc.2008.12.002). | Human ventricular computational model; calcium/APD context. |
| Kazama I (2017). *High-calcium exposure to frog heart: a simple model representing hypercalcemia-induced ECG abnormalities.* [doi:10.1292/jvms.16-0413](https://doi.org/10.1292/jvms.16-0413). | Paired frog AP/ECG observations; species boundary retained. |
| Yang et al. (2021). *The ECG Characteristics of Patients With Isolated Hypomagnesemia.* [doi:10.3389/fphys.2020.617374](https://doi.org/10.3389/fphys.2020.617374). | Human within-patient observational comparison. |
| Rasmussen HS, Thomsen PE (1989). *The electrophysiological effects of intravenous magnesium on human sinus node, atrioventricular node, atrium, and ventricle.* [doi:10.1002/clc.4960120204](https://doi.org/10.1002/clc.4960120204). | Human electrophysiology context for conduction effects. |
| Davidenko JM, Cohen L, Goodrow R, Antzelevitch C (1989). *Quinidine-induced action potential prolongation, early afterdepolarizations, and triggered activity in canine Purkinje fibers. Effects of stimulation rate, potassium, and magnesium.* [doi:10.1161/01.CIR.79.3.674](https://doi.org/10.1161/01.CIR.79.3.674). | Conditional vulnerable-cell example; an illustrative cellular EAD does not automatically generate a surface torsades episode. |

Example laboratory ranges link to Mayo Clinic Laboratories for
[potassium](https://www.mayocliniclabs.com/test-catalog/overview/602352),
[ionized calcium](https://www.mayocliniclabs.com/test-catalog/overview/8378), and
[magnesium](https://www.mayocliniclabs.com/test-catalog/Overview/8448). They are
labeled examples, with mass-to-molar conversions documented; updating laboratory
reference values requires checking the current source and specimen definition.

## Channel and pharmacology structures

The following accession-to-paper mappings were checked against the official
RCSB PDB entry metadata. See [channel processing](../data-source/channel-structures/README.md)
and its [transforms/hashes](../data-source/channel-structures/provenance.json).
The visualizations are custom coordinate representations. Structure state,
species, constructs, and inferred viewing orientation remain distinct from the
animated educational cartoons.

| PDB entry | Primary structural citation | Used for |
| --- | --- | --- |
| [9P24](https://www.rcsb.org/structure/9P24) | Biswas, R. et al. (2026). *Structural and functional mechanisms underlying activation gate dynamics and IFM motif accessibility in human NaV1.5*. [DOI](https://doi.org/10.1038/s41467-026-69672-x) | NaV1.5 channel lens; intermediate-open structural snapshot. |
| [8HLP](https://www.rcsb.org/structure/8HLP) | Wei, Y. et al. (2024). *Structural bases of inhibitory mechanism of CaV1.2 channel inhibitors*. [DOI](https://doi.org/10.1038/s41467-024-47116-8) | CaV1.2 channel lens; apo/inactivated complex, not an open gating movie. |
| [9UC8](https://www.rcsb.org/structure/9UC8) | Zhong, L. et al. (2025). *Secondary structure transitions and dual PIP2 binding define cardiac KCNQ1-KCNE1 channel gating*. [DOI](https://doi.org/10.1038/s41422-025-01182-9) | KCNQ1–KCNE1–CaM lens; I_Ks architecture, not hERG/I_Kr. |
| [6LQA](https://www.rcsb.org/structure/6LQA) | Li, Z. et al. (2021). *Structural Basis for Pore Blockade of the Human Cardiac Sodium Channel NaV1.5 by the Antiarrhythmic Drug Quinidine*. [DOI](https://doi.org/10.1002/anie.202102196) | Quinidine-bound human NaV1.5 reference. |
| [6UZ0](https://www.rcsb.org/structure/6UZ0) | Jiang, D. et al. (2020). *Structure of the Cardiac Sodium Channel*. [DOI](https://doi.org/10.1016/j.cell.2019.11.041) | Flecainide reference from a rat NaV1.5 construct. |
| [7FBS](https://www.rcsb.org/structure/7FBS) | Jiang, D. et al. (2021). *Open-state structure and pore gating mechanism of the cardiac sodium channel*. [DOI](https://doi.org/10.1016/j.cell.2021.08.021) | Propafenone/open-state reference from an engineered NaV1.5 construct. |
| [6JPA](https://www.rcsb.org/structure/6JPA) | Zhao, Y. et al. (2019). *Molecular Basis for Ligand Modulation of a Mammalian Voltage-Gated Ca²⁺ Channel*. [DOI](https://doi.org/10.1016/j.cell.2019.04.043) | Verapamil-bound rabbit CaV1.1; a homolog of cardiac L-type channels. |
| [6JPB](https://www.rcsb.org/structure/6JPB) | Zhao, Y. et al. (2019). *Molecular Basis for Ligand Modulation of a Mammalian Voltage-Gated Ca²⁺ Channel*. [DOI](https://doi.org/10.1016/j.cell.2019.04.043) | Diltiazem-bound rabbit CaV1.1; a homolog of cardiac L-type channels. |
| [7DDH](https://www.rcsb.org/structure/7DDH) | Kanai, R. et al. (2021). *Binding of cardiotonic steroids to Na⁺,K⁺-ATPase in the E2P state*. [DOI](https://doi.org/10.1073/pnas.2020438118) | Digoxin-bound Na+/K+-ATPase; X-ray crystallography, not cryo-EM. |
| [6D9H](https://www.rcsb.org/structure/6D9H) | Draper-Joyce, C.J. et al. (2018). *Structure of the adenosine-bound human adenosine A1 receptor–Gi complex*. [DOI](https://doi.org/10.1038/s41586-018-0236-6) | Adenosine-bound A1 receptor–Gi complex; indirect channel regulation. |
| [5VA1](https://www.rcsb.org/structure/5VA1) | Wang, W. & MacKinnon, R. (2017). *Cryo-EM Structure of the Open Human Ether-a-go-go-Related K(+) Channel hERG*. [DOI](https://doi.org/10.1016/j.cell.2017.03.048) | Drug-free hERG pore reference; does not identify a drug-specific bound pose. |

PDB archive reference: **Berman HM, Westbrook J, Feng Z, et al. (2000). *The
Protein Data Bank.* Nucleic Acids Research 28:235–242**,
[doi:10.1093/nar/28.1.235](https://doi.org/10.1093/nar/28.1.235).
[RCSB policies](https://www.rcsb.org/pages/policies) distinguish CC0 coordinate
data from separately licensed site imagery and other resources.

The drug explorer's [source content](../dist/cardiac-voltage/data/pharmacology-content.json)
retains exact official DailyMed label links, experimental pharmacology papers,
and per-drug evidence levels. Illustrative effect strength is not concentration,
dose, or a predicted patient response. The current source app does not infer a
binding pose merely because two drugs share a pharmacological class.

## Microscopy

- **Berkshire Community College Bioscience Image Library (2018).** *Muscle Tissue: Intercalated Discs in Cardiac Muscle.* [Original/source record](https://commons.wikimedia.org/wiki/File:Muscle_Tissue_Intercalated_Discs_in_Cardiac_Muscle_(27061947267).jpg). The light-microscopy image supports tissue morphology; absent specimen details and calibrated scale are explicitly left unknown.
- **Dykstra M, National Toxicology Program.** *Rodent Ultrastructure Atlas*, Muscle, Figure 6. [Atlas](https://ntp.niehs.nih.gov/atlas/us/musculoskeletal-system/muscle), [doi:10.22427/NTP-OTHER-1006](https://doi.org/10.22427/NTP-OTHER-1006). TEM reference for an intercalated-disc gap junction, with the original scale bar retained.
- **Romero D, Camara O, Sachse F, Sebastian R (2016).** *Analysis of Microstructure of the Cardiac Conduction System Based on Three-Dimensional Confocal Microscopy.* PLOS ONE 11(10):e0164093, [doi:10.1371/journal.pone.0164093](https://doi.org/10.1371/journal.pone.0164093). Included **Figure 2**, [figure DOI](https://doi.org/10.1371/journal.pone.0164093.g002), contains rabbit confocal microscopy and reconstructed geometry. Geometric proximity alone does not establish functional coupling.

[Microscopy provenance](../dist/cardiac-voltage/assets/microscopy/provenance.json)
retains the unmodified image sources, extraction details, species limits,
licensing and checksums.

## Engineering provenance and review limits

The renderer includes [Three.js r180](https://github.com/mrdoob/three.js/tree/r180)
and matching addons. [DM Sans](https://github.com/googlefonts/dm-fonts) and
[Instrument Serif](https://github.com/Instrument/instrument-serif) are the local
font families. The [complete software/font notices](../THIRD_PARTY_NOTICES.md)
identify the applicable licenses and copyright holders.

This release preserves the completed implementation and numerical assets. It
does not repeat the full fitting campaign or silently turn prior script reports
into new validation. Current release checks are recorded separately from the
retained original studies and browser audits. When changing scientific behavior,
update the relevant source metadata, methods, asset hashes, and comparison
results together; explain whether a result is measured, computed, inferred, or
illustrative.
