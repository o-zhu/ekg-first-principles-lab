const specimens=[
  {
    id:'muscle',tab:'Muscle cells',eyebrow:'LIGHT MICROSCOPY · LONGITUDINAL SECTION',
    title:'Follow a chain of whole muscle cells.',
    image:'./assets/microscopy/cardiac-muscle-light-200x.jpg',
    alt:'Longitudinal cardiac muscle with elongated striated cells, dark central nuclei, and thicker transverse intercalated discs.',
    metadata:'Cardiac muscle · source reports 200× · species not specified in the original description',
    lead:'These elongated, striated cardiomyocytes connect at intercalated discs—the tissue counterpart of the animation.',
    features:[['Central nuclei','Dark oval structures lie within the muscle cells.'],['Striations','Fine repeating transverse bands come from the contractile sarcomeres.'],['Intercalated discs','The thicker, irregular transverse lines mark junctions between adjacent cells. A disc includes mechanical attachments and electrical gap junctions.']],
    takeaway:'Current spreads through the cytoplasm of one muscle cell and through gap junctions into another. A cardiomyocyte does not send out a separate axon.',
    credit:'Berkshire Community College Bioscience Image Library · 2018',
    source:'https://commons.wikimedia.org/wiki/File:Muscle_Tissue_Intercalated_Discs_in_Cardiac_Muscle_(27061947267).jpg',
    license:'CC0 1.0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',
    figureNote:'Original photograph; no annotations or image alterations added. Magnification is the source’s acquisition label, not the physical magnification on your screen.'
  },
  {
    id:'junction',tab:'Electrical junction',eyebrow:'TRANSMISSION ELECTRON MICROSCOPY · 500 nm SCALE BAR',
    title:'The electrical connection is between two cells.',
    image:'./assets/microscopy/cardiac-gap-junction-tem.jpg',
    alt:'Electron micrograph of an intercalated disc with original labels: 1 gap junction, 2 fascia adherens, 3 associated filaments, 4 sarcoplasmic reticulum; scale bar 500 nanometers.',
    metadata:'Rodent cardiac muscle · NTP Ultrastructure Atlas, figure 6 · source reports 49,000×',
    lead:'Arrow 1 marks a gap junction at an intercalated disc: the cell-to-cell connection that carries electrical current.',
    features:[['1 · Gap junction','Closely apposed membranes contain channels that connect neighboring cytoplasms and allow ionic current.'],['2–3 · Mechanical attachment','Fascia adherens and associated filaments anchor the contractile apparatus.'],['4 · Sarcoplasmic reticulum','Internal membrane structures; the original label is retained.']],
    takeaway:'Electrical coupling crosses a cell-to-cell junction. The muscle cells remain separate cells, with their own membranes.',
    credit:'Michael Dykstra · National Toxicology Program, NIEHS · figure 6',
    source:'https://ntp.niehs.nih.gov/atlas/us/musculoskeletal-system/muscle',
    license:'Public domain · NTP policy',licenseUrl:'https://ntp.niehs.nih.gov/support/policies',
    figureNote:'Native JPEG extracted from the atlas PDF. Original labels and 500 nm scale bar preserved. The figure caption does not identify a more specific rodent species.'
  },
  {
    id:'purkinje',tab:'Purkinje cells',eyebrow:'RABBIT HEART · CONFOCAL MICROSCOPY & RECONSTRUCTIONS',
    title:'Specialized conducting cells are also myocytes.',
    image:'./assets/microscopy/purkinje-rabbit-confocal-romero-fig2.png',
    alt:'Romero and colleagues figure 2: top panels are confocal images of Purkinje and working ventricular cells; lower panels are blue three-dimensional reconstructions of Purkinje cells.',
    metadata:'Romero et al., 2016 · rabbit · WGA labeling · original 25 and 30 μm scale bars',
    lead:'The top row (a–c) contains confocal images. P marks Purkinje cells; V marks working ventricular muscle; Pₜ identifies a proposed transitional cell.',
    features:[['a–c · Acquired images','WGA highlights cell boundaries and extracellular structures. Purkinje cells have a sparse tubular system compared with the working ventricular cell.'],['d–i · Reconstructions','These blue shapes are the authors’ 3D reconstructions from image stacks, not additional micrographs.'],['A connected network','Purkinje cells include elongated and branching forms that couple to other Purkinje cells and to working myocardium.']],
    takeaway:'The fast His–Purkinje network distributes excitation to the ventricular muscle. Module 2 depicts propagation and recovery within the working muscle.',
    credit:'Romero, Camara, Sachse & Sebastian · PLOS ONE 11(10), e0164093 · figure 2',
    source:'https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0164093',
    license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',
    figureNote:'Complete original figure, unaltered. Structural proximity in these images alone does not establish functional electrical coupling at every apparent contact.'
  }
];

let selected='muscle',handlers={};
const $=id=>document.getElementById(id);
function showSpecimen(id){
  const item=specimens.find(x=>x.id===id)||specimens[0];selected=item.id;
  document.querySelectorAll('[data-micrograph]').forEach(b=>{
    const active=b.dataset.micrograph===selected;
    b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;
  });
  const panel=$('microscopy-panel');panel.setAttribute('aria-labelledby','micrograph-tab-'+selected);
  panel.innerHTML=`<div class="microscopy-specimen"><figure><div class="microscopy-image-stage"><img src="${item.image}" alt="${item.alt}" decoding="async"></div><figcaption>${item.metadata}</figcaption><a class="microscopy-original" href="${item.image}" target="_blank" rel="noopener">Open full-resolution image ↗</a></figure><div class="microscopy-explanation"><span class="micrograph-kind">${item.eyebrow}</span><h3>${item.title}</h3><p>${item.lead}</p><dl>${item.features.map(([label,description])=>`<div><dt>${label}</dt><dd>${description}</dd></div>`).join('')}</dl><p class="microscopy-takeaway">${item.takeaway}</p></div></div><div class="microscopy-attribution"><p>${item.credit}</p><div><a href="${item.source}" target="_blank" rel="noopener">Source & caption ↗</a><a href="${item.licenseUrl}" target="_blank" rel="noopener">${item.license} ↗</a></div><p class="microscopy-figure-note">${item.figureNote}</p></div>`;
}
export function initializeMicroscopy(options={}){
  handlers=options;
  $('microscopy-tabs').innerHTML=specimens.map((s,i)=>`<button id="micrograph-tab-${s.id}" role="tab" aria-controls="microscopy-panel" aria-selected="${i===0}" tabindex="${i===0?0:-1}" data-micrograph="${s.id}"><img src="${s.image}" alt="" loading="lazy" decoding="async"><span class="microscopy-tab-label"><small>0${i+1}</small>${s.tab}</span></button>`).join('');
  document.querySelectorAll('[data-micrograph]').forEach(b=>b.onclick=()=>showSpecimen(b.dataset.micrograph));
  $('microscopy-tabs').addEventListener('keydown',event=>{
    if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
    event.preventDefault();const i=specimens.findIndex(s=>s.id===selected);
    const next=event.key==='Home'?0:event.key==='End'?specimens.length-1:(i+(event.key==='ArrowRight'?1:specimens.length-1))%specimens.length;
    showSpecimen(specimens[next].id);$('micrograph-tab-'+selected).focus();
  });
  $('microscopy-close').onclick=()=>$('microscopy-dialog').close();
  $('microscopy-dialog').addEventListener('close',()=>handlers.onClose?.());
  $('microscopy-dialog').addEventListener('click',event=>{
    if(event.target!==$('microscopy-dialog'))return;
    const r=event.target.getBoundingClientRect();
    if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();
  });
}
export function openMicroscopy(){
  handlers.onOpen?.();showSpecimen(selected);$('microscopy-dialog').showModal();$('microscopy-dialog').scrollTop=0;
}
