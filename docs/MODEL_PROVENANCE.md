# Reference anatomy provenance

The application uses two distinct anatomical representations. Neither is matched to the people whose ECGs appear in the clinical library.

## BodyParts3D display anatomy

The main lesson heart, chest bones, and skin derive from BodyParts3D 4.0, IS-A OBJ archive, polygon reduction rate 99%, retrieved 2026-09-22 according to the retained source manifest. The archive's current [license page](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html) grants CC BY 4.0; the older OBJ headers name CC BY-SA 2.1 Japan. The current grant and that discrepancy are preserved in [the model attribution](../dist/models/ATTRIBUTION.md) and [third-party notices](../THIRD_PARTY_NOTICES.md).

Required credit: **BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International.** OrganUI prepared the original heart display asset; its separate MIT notice is retained. EKG Lab adds explanatory coloring, electrical overlays, illustrative deformation, cutaway processing, and separately documented junction geometry.

The authoritative retained details are:

- [`heart-manifest.json`](../dist/models/heart-manifest.json): original archive and member hashes, selected structures, coordinate center, scale, axis transform, and runtime asset mapping.
- [`chest-manifest.json`](../dist/models/chest-manifest.json): chest selections, common coordinate transform, cropping/modifications, and resulting assets.
- [`low-models.json`](../dist/models/low-models.json): retained reduced-detail asset information.
- [`heart-junctions.json`](../dist/models/heart-junctions.json): added seam/collar geometry and its construction assumptions.

The visible axes convert source coordinates from Z-up to Y-up; the exact numeric mapping and units remain in the manifests rather than being restated from memory. Illustrative colors and heartbeat motion are not measured physiological quantities. The two ventricular walls are not independent original tissue meshes; cavity surfaces represent spaces rather than myocardium.

The original base OBJ-to-GLB and level-of-detail conversion scripts were not recovered. The junction preparation script is retained but expects a separately obtained raw source archive. Finished runtime meshes remain usable. Earlier notices referenced a dated license-page snapshot and a `docs/model-source/` folder; those files are absent from the recovered source, and this document does not recreate them or assert that it is the original snapshot.

## CT-derived electrical source geometry

Module 1's whole-heart forward model and the fitted clinical source models use the Rodero et al. CT-derived statistical-average four-chamber geometry, not the BodyParts3D display surface. That dataset is CC BY 4.0. Its appended LAA body is an explicitly inferred extension attached at a retained source ostium. Atrial and RV thickness conventions, tetrahedral labels, coordinate handling, graph propagation, torso assumptions, and source quadrature are described in [the retained four-chamber methods](../dist/cardiac-voltage/data/FOUR_CHAMBER_METHODS.md).

The electrical atlas transfers reference field information to the display geometry for teaching. This is a modeled correspondence between different reference geometries. It is not a registration to any clinical patient's anatomy. See [reproducibility](REPRODUCIBILITY.md), [architecture](ARCHITECTURE.md), and [references](REFERENCES.md) for the exact roles and available source scripts.
