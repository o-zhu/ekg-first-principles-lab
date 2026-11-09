# Channel visual update — v14

## Teaching view

The membrane chapter retains the original voltage and surface-charge model. Three cutaway protein cartoons use shaded helical bundles, a selective extracellular entrance, and an intracellular activation gate. Sodium additionally uses a side-docking IFM linker to illustrate fast inactivation. Sodium and calcium correspond to four repeated domains of a principal protein; the potassium cartoon represents a four-subunit architecture. The simplified delayed potassium current includes multiple repolarizing currents and is not assigned solely to KCNQ1.

Both the gate and the ion stream use one progress-derived channel state. A conducting aperture is enlarged to accommodate the deliberately oversized teaching ion. Closed and inactivated channels have no conducting stream. The schematic phase transitions are not quantitative channel kinetics.

## Optional experimental view

Click a channel or use Explore the channels. This pauses the membrane clock and opens a rotatable, zoomable view of experimentally resolved C-alpha coordinates. The same source asset supplies all three structures. Deposited helix annotations determine where ribbons appear; Catmull–Rom interpolation smooths the resolved backbone within each continuous segment. Other regions are thin traces. Missing regions are not bridged. Surface lighting is a visual aid; atomic radii, side chains, ligands and ion trajectories are not reconstructed.

The molecular structure stays fixed while the camera rotates. The experiment's captured state, resolution, original study, RCSB entry and limitations are shown for each channel. Accessory chains can be included separately. A coordinate-derived scale bar is labeled in nanometers. A fitted membrane plane is deliberately not implied.

## Validation

- Main cartoon render sweep: 303 frames spanning cycle phases and three viewport sizes, finite drawing coordinates, three channel hit targets, and no closed/inactivated ion streams.
- Browser inspection of the embedded and expanded membrane lesson, and all three experimental structures.
- Structure tabs, side/end-on views, zoom, accessory visibility and keyboard rotation/reset/Escape close checked in the browser.
- Responsive structure dialog checked at a 390-pixel iframe viewport: no horizontal overflow; content scrolls vertically.
- The coordinate builder independently checks source hashes, biological assembly, modeled-residue counts, segment continuity, and finite coordinates. See provenance.json and README.md.
- No changes to the membrane-voltage equations, experimental ECG data, or modules 2–6.
