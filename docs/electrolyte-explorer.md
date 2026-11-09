# Optional electrolyte explorer in Module 1

The membrane chapter contains an **Explore electrolyte abnormalities** button,
alongside the existing channel and pharmacology explorers. The native dialog
pauses the lesson and compares baseline with a selected extracellular electrolyte.
It is isolated from the Module 5 clinical recordings and fitted propagation data.

## Scientific scope

- **Potassium:** an explicit Nernst calculation, a fixed-permeability resting
  voltage approximation, and qualitative changes in upstroke and recovery.
  Low K includes the distinction between its steeper gradient and reduced
  repolarizing currents/pump activity. High K includes the biphasic relationship
  between depolarization and excitability; no concentration-specific ECG stages
  or channel-availability percentages are asserted.
- **Calcium:** ionized extracellular calcium, with a resting free intracellular
  value of 100 nM used only for Nernst. The illustrative plateau and ST/QT
  lengthen with lower calcium and shorten with higher calcium. This is not
  computed by equating the cellular voltage to the calcium equilibrium voltage.
- **Magnesium:** serum total magnesium with no invented magnesium Nernst or
  serum-to-resting-potential mapping. Isolated low-Mg traces may overlap; an
  optional vulnerable-cell illustration adds an early afterdepolarization.
  The bump does not generate an automatic surface ectopic beat or torsades.
  High Mg primarily illustrates delayed atrial/AV conduction and ventricular
  arrival, with little change in intrinsic ventricular AP shape.

## Calculations and graphic conventions

The Nernst equation uses R = 8.314462618 J/(mol K), T = 310.15 K and
F = 96485.33212 C/mol, with concentration substituted for activity.
For potassium, intracellular K is fixed at 140 mmol/L. The resting approximation
uses the two-cation Goldman expression with PNa/PK = 0.01, extracellular Na
140 mmol/L and intracellular Na 10 mmol/L. Chloride, electrogenic pumps and
concentration-dependent permeability changes are omitted. The limitation is
especially relevant at very low potassium.

The single-cell AP and surface ECG are separately specified teaching curves.
Their concentration-response weights, intervals and amplitudes are not clinical
fits. The ECG is not derived from the illustrated cell and has an arbitrary
amplitude unit. Both comparisons retain fixed axes. At baseline, the reference
and selected traces are numerically identical, including when the vulnerable
magnesium context is enabled.

Source links and the exact assumptions appear in the explorer. Evidence includes
direct microelectrode recordings (Miura 1977), guinea-pig optical mapping (King
2021), experimental hypokalemia work (Pezhouman 2015), a human hyperkalemia cohort
(Montague 2008), human ventricular modeling (Grandi 2009), paired frog AP/ECG
recordings (Kazama 2017), human isolated hypomagnesemia observations (Yang 2021),
and a human magnesium electrophysiology study (Rasmussen and Thomsen 1989).
The optional vulnerable-cell perturbation is also supported by quinidine-exposed
Purkinje-fiber experiments (Davidenko et al. 1989); the label distinguishes a
slowed decline from an actual upward early afterdepolarization.
Reference intervals are explicitly examples from Mayo Clinic Laboratories;
calcium and magnesium mass units are converted to mmol/L.

## Validation

Run `node scripts/check-electrolytes.mjs` from the source checkout. The check
tests Nernst constants and valence, gradient reversal, reference identity,
finite/bounded waveforms across the available concentrations, recovery timing,
and the distinction between a conditional cellular EAD and an invented ECG beat.

Browser checks cover the embedded Module 1 entry, preset and slider changes,
time scrubbing/playback, closing/reopening, sources, keyboard isolation and
responsive layout. The embedded desktop view and a 390-pixel iframe viewport
were checked; all three electrolyte modes fit without horizontal overflow.
Escape returned focus, closing stopped playback, and main-lesson progress stayed
fixed while the explorer's sliders received keyboard input. Chapter and outer
module navigation recreated the optional launch correctly. The numerical check
passed 204 concentration/context scenarios and 163,404 waveform samples.
The imported v15 `dist/PACKAGE-MANIFEST.json` remains a
historical record of the supplied package; it is not a manifest of later edits.
