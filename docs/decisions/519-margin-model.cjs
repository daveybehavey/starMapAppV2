const fx=1.3978;
const scenarios=[
 ['20x20 poster',13.75,4.49,5.17,[59,69,79],[83,97,111]],
 ['16x16 black frame',37.72,9.84,10.77,[119,129,139],[167,181,195]],
 ['14x14 frame colours',33.81,9.84,10.77,[99,109,119],[139,153,167]],
 ['18x18 canvas',28.75,10.05,17.12,[99,109,119],[139,153,167]],
 ['20x20 canvas',33.5,10.05,17.12,[109,119,129],[153,167,181]],
 ['two 16x16 posters',25,8.98,10.34,[79,89,99],[111,125,139]],
 ['three 16x16 posters',37.5,13.47,15.51,[109,129,149],[153,181,209]],
 ['three 12x16 canvases',67.5,30.15,51.36,[249,279,299],[349,391,419]],
 ['landscape 20x16 poster',12.75,4.49,5.17,[49,59,69],[69,83,97]],
];
let md='| Scenario | USD prices → modeled US contribution $ (%) | CAD prices → modeled CA contribution C$ (%) |\n|---|---|---|\n';
for(const [name,b,su,sc,pu,pc] of scenarios){
 const u=pu.map(p=>{const c=p*.971-.3-b-su;return `${p} → ${c.toFixed(2)} (${(100*c/p).toFixed(1)}%)`}).join('; ');
 const c=pc.map(p=>{const c=p*.971-.3-(b+sc)*fx;return `${p} → ${c.toFixed(2)} (${(100*c/p).toFixed(1)}%)`}).join('; ');
 md+=`| ${name} | ${u} | ${c} |\n`;
}
console.log(md);
