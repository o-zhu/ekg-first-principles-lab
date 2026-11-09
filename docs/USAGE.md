# Using EKG Lab

Follow the setup instructions in the [project README](../README.md): prepare the finished runtime data with `npm run setup:assets`, then run `npm start` and open its local HTTP URL. No numerical fitting is needed. The six modules are available from the course navigation; their URL fragments are listed below. Explanations and provenance are available through the **info** buttons and **Sources & limitations**.

## Shared interactions

- **Explore the heart:** drag to rotate, scroll or pinch to zoom, and right-drag or use two fingers to pan. The on-screen **+**, **−**, and reset buttons provide alternatives. With the main 3D canvas focused, arrow keys adjust the view and **+ / −** zoom.
- **Explore time:** click or drag a trace, move its time slider, or choose a phase to play from that instant. Seeking resumes playback in the animated lessons, including the fitted model. Use **Pause** when you want to hold an instant. Module 4 is a stationary measurement lesson.
- **Change speed:** the shared simulations offer **0.03×, 0.1×, 0.3×, and 1×**. Module 1 has its own chapter clock and speed control. Playback speed changes how quickly the lesson runs, not the physiological rate or recorded sample times.
- **Find controls in the visual:** Module 2 and Module 5's **Recording & anatomy** view place **Surface anatomy**, **Electrical cutaway**, and the speed selector inside the 3D window. The fitted-model view has its own controls.
- **Read details:** hover over or activate an info button. Reduced-motion preference starts animations paused. Finite recordings stop at their end; use Play/Restart or seek to an earlier time to continue.

## 01 · Electrical foundations (`#electricity`)

Use the four chapter tabs: **The membrane**, **The wave**, **The lead**, and **The whole heart**. Follow a voltage trace while changing the chapter's experiments. The lead lesson includes electrode polarity and reference experiments. **Show the mathematics** and the science notes explain the corresponding model.

In **The whole heart**, choose **Human recordings** or **3D heart model**. Select tissue sites and compare their action potentials on a shared time axis. The human optical view includes donor selection and single-beat/ensemble options; its normalized fluorescence is not calibrated membrane voltage and has no paired ECG.

Optional explorers cover channels, pharmacology, and **Explore electrolyte abnormalities**. In the electrolyte explorer, choose **potassium, calcium, or magnesium**, adjust concentration or use a preset, and compare the baseline and changed action-potential/ECG illustrations. The ECG illustration is not calculated from the single displayed cell. The magnesium explorer also offers a vulnerable prolonged-repolarization example. See [electrolyte model notes](electrolyte-explorer.md).

## 02 · Conduction & motion (`#heartbeat`)

Rotate the heart, switch between surface anatomy and electrical cutaway, and choose a lead. Use the activation, labels, contraction, and conduction controls to isolate what you are following. The heart-rate slider changes the teaching model's rate.

Use **Explore tissue action potentials** to reach the cellular section. Compare the SA node, atrial muscle, AV node, His, Purkinje, and ventricular inner/outer-wall examples. Select a sampling site and locate it in 3D while following the synchronized ECG. These illustrative cell traces are not seven measured cells whose voltages are simply added to produce the surface ECG. Region contribution switches isolate parts of the teaching signal; they do not simulate tissue ablation.

## 03 · The 12 leads (`#leads`)

Choose individual leads, **All 12**, or **Reset**. Rotate the torso or use the anatomical view presets. Skin, bones, labels, axes, and the frontal reference plane have separate switches; turning **Labels** off also hides lead captions.

The playback panel sits beneath the ECG sheet. Increase **Waveform height** with its slider or **+ / −**, or hold **Shift** while scrolling over a trace. Gain spans **5–40 mm/mV** and resets to **10 mm/mV**. Every selected lead uses the same gain, and rows expand to retain the waveform. This changes display height, not voltage values or time.

The frontal source-direction control changes the limb-lead teaching projection. Rotating the camera changes only the view. Lead arrows are geometric direction guides, not computed lead fields or exact electrode locations.

## 04 · ECG measurements (`#rhythm`)

Choose a lead and heart rate, then select **P wave**, **PR interval**, **QRS**, **ST segment**, **T wave**, **QT / QTc**, or **RR / rate**. The associated electrical snapshot stays frozen.

Set paper speed to **25 or 50 mm/s** and gain to **5, 10, or 20 mm/mV**. Turn wave labels or **Calipers** on as needed. Drag a caliper, or focus the chart and use **1 / 2** to select a handle and arrow keys to move it; Shift makes larger steps. Changing paper speed alters the grid scale without changing the signal's time values. Adult reference values are teaching guides with contextual limitations, not stand-alone diagnostic cutoffs.

## 05 · Clinical patterns (`#library`)

Choose a category, then a case. **Recording & anatomy** pairs the original ECG samples with reference anatomy and an explanatory mechanism. Choose a recorded lead/channel, change gain, or open the available multi-lead view. Its time-window selector provides detail or a full-record overview. **Source record** and the case notes identify the recording and timing assumptions.

The playback panel is directly below **What is happening now** in the ECG column. Beat navigation is available only where discrete event markers support it. The displayed activation and contraction remain illustrative, even when timing follows a recorded marker.

Where available, **Fitted model** compares the observed signal with a saved source-model prediction. Select a model experiment, lead, or electrical map; click the myocardium to sample local voltage. Beat-based fits can compare all accepted, training, or held-out beats. Inspect the residual metrics, other leads, and methods alongside the visually appealing fit. A close fit does not uniquely identify the patient's activation, anatomy, or physiology.

## 06 · Rhythm builder (`#sandbox`)

Load a preset or combine atrial rhythm/rate, AV conduction, bundle conduction, chamber-voltage pattern, frontal source direction, and occasional PVCs. Complete block exposes an independent escape rate. Compare the generated tracing with the optional sinus reference and inspect its event rail and model measurements.

Changing a rhythm setting rebuilds the example and pauses it; press **Play** or seek on the trace to explore the new result. Reset restores the healthy sinus configuration. These are scheduled teaching signals, not predictions of an individual patient's tracing, chamber dimensions, contractile strength, or risk.

## Interpreting what you see

Keep the evidence type visible when teaching: **recorded ECG**, **processed optical measurement**, **illustrative simulation**, and **fitted source hypothesis** answer different questions. Anatomy, optical donors, and ECG subjects are not assumed to be the same people. Consult the in-app case/model notes before presenting a timing, field map, or numerical result as measured evidence. EKG Lab is an educational preview, not a diagnostic or treatment tool.
