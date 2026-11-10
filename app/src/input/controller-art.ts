import type {ControlTarget} from './control-guide-model';
const ns='http://www.w3.org/2000/svg';
function svg(markup:string, viewBox:string){const root=document.createElementNS(ns,'svg');root.setAttribute('viewBox',viewBox);root.setAttribute('aria-hidden','true');root.innerHTML=markup;return root;}
/** Original, manufacturer-neutral artwork. All physical controls have standard API indices. */
export function controllerArt(){
 return svg(`
 <defs>
  <linearGradient id="sv-pad-shell" x2="0.2" y2="1"><stop stop-color="#fff9ec"/><stop offset="1" stop-color="#dfdfca"/></linearGradient>
  <linearGradient id="sv-pad-grip" x2="0.5" y2="1"><stop stop-color="#789273"/><stop offset="1" stop-color="#496e50"/></linearGradient>
  <linearGradient id="sv-pad-stick" x2="0" y2="1"><stop stop-color="#65785b"/><stop offset="1" stop-color="#344c3d"/></linearGradient>
 </defs>
 <ellipse cx="260" cy="316" rx="206" ry="19" fill="#344c3d" opacity=".09"/>
 <g class="sv-pad-key" data-pad="6"><path d="M108 71 V39 Q109 23 128 23 H149 Q169 24 171 42 L174 71Z"/></g>
 <g class="sv-pad-key" data-pad="7"><path d="M346 71 L349 42 Q351 24 371 23 H392 Q411 23 412 39 V71Z"/></g>
 <g class="sv-pad-key" data-pad="4"><path d="M90 89 L99 65 Q103 53 119 53 H166 Q179 53 185 72 L188 89Z"/></g>
 <g class="sv-pad-key" data-pad="5"><path d="M332 89 L335 72 Q341 53 354 53 H401 Q417 53 421 65 L430 89Z"/></g>
 <path d="M137 74 C88 73 66 102 53 149 L26 266 C20 300 42 322 66 312 C94 299 119 258 142 238 C169 215 189 225 212 235 H308 C331 225 351 215 378 238 C401 258 426 299 454 312 C478 322 500 300 494 266 L467 149 C454 102 432 73 383 74 C340 76 320 89 296 90 H224 C200 89 180 76 137 74Z" fill="url(#sv-pad-shell)" stroke="#879276" stroke-width="3"/>
 <path d="M68 187 C81 195 95 214 112 236 L67 296 Q42 317 38 286Z M452 187 C439 195 425 214 408 236 L453 296 Q478 317 482 286Z" fill="url(#sv-pad-grip)" opacity=".85"/>
 <path d="M78 123 Q91 89 133 88 Q177 88 217 103 H303 Q343 88 387 88 Q429 89 442 123" fill="none" stroke="#fffdf3" stroke-width="5" stroke-linecap="round"/>
 <path d="M208 114 Q260 125 312 114 L301 174 Q260 188 219 174Z" fill="#e9e8d8" stroke="#c7cbb5"/>
 <path d="M249 151 Q249 134 269 133 Q271 151 251 155 M251 155 L266 138" fill="#789273" stroke="#496e50" stroke-width="2" stroke-linecap="round"/>
 <circle cx="134" cy="153" r="49" fill="#d4dac6" stroke="#bdc5ae" stroke-width="2"/>
 <g class="sv-pad-key" data-pad="12"><path d="M121 117 Q134 111 147 117 V141 H121Z"/><path class="sv-pad-mark" d="M130 128 L134 124 L138 128"/></g>
 <g class="sv-pad-key" data-pad="13"><path d="M121 165 H147 V189 Q134 195 121 189Z"/><path class="sv-pad-mark" d="M130 178 L134 182 L138 178"/></g>
 <g class="sv-pad-key" data-pad="14"><path d="M98 140 H122 V166 H98 Q92 153 98 140Z"/><path class="sv-pad-mark" d="M109 149 L105 153 L109 157"/></g>
 <g class="sv-pad-key" data-pad="15"><path d="M146 140 H170 Q176 153 170 166 H146Z"/><path class="sv-pad-mark" d="M159 149 L163 153 L159 157"/></g>
 <rect x="122" y="141" width="24" height="24" rx="5" fill="#65785b"/>
 <circle cx="386" cy="153" r="52" fill="#e1e4d3" stroke="#c7cbb5"/>
 ${[[0,386,187],[1,420,153],[2,352,153],[3,386,119]].map(([i,x,y])=>`<g class="sv-pad-key sv-pad-face" data-pad="${i}"><circle cx="${x}" cy="${y+2}" r="17" fill="#9aa68a"/><circle cx="${x}" cy="${y}" r="16"/><circle class="sv-pad-dot" cx="${x}" cy="${y}" r="4"/></g>`).join('')}
 <g class="sv-pad-key" data-pad="8"><rect x="196" y="130" width="25" height="15" rx="7"/><path class="sv-pad-mark" d="M204 137 H213"/></g>
 <g class="sv-pad-key" data-pad="9"><rect x="299" y="130" width="25" height="15" rx="7"/><path class="sv-pad-mark" d="M307 135 H316 M307 140 H316"/></g>
 ${[[184,'left-stick',10],[336,'right-stick',11]].map(([x,id,button])=>`<g data-pad="${id}" class="sv-pad-key sv-pad-analog"><g data-pad="${button}" class="sv-pad-key"><circle cx="${x}" cy="219" r="39" fill="#c2cbb2" stroke="#879276" stroke-width="2"/><circle cx="${x}" cy="219" r="32" fill="url(#sv-pad-stick)"/><circle cx="${x}" cy="217" r="25" fill="#637a5b" stroke="#91a186" stroke-width="2"/><path class="sv-pad-mark" d="M${Number(x)-13} 204 Q${x} 196 ${Number(x)+13} 204"/></g></g>`).join('')}
 <g fill="#a3ae95">${[0,1,2,3,4].map(i=>`<circle cx="${244+i*8}" cy="204" r="1.5"/>`).join('')}</g>`, '0 0 520 344');
}
/** A miniature spatial map, never a manufacturer-specific letter or emoji. */
export function controlIcon(targets:ControlTarget[]){
 const has=(i:ControlTarget)=>targets.includes(i)?' class="is-target"':'';
 let markup='';
 if(targets.some(i=>typeof i==='number'&&i<4)) markup=[[0,22,35],[1,35,22],[2,9,22],[3,22,9]].map(([i,x,y])=>`<circle${has(i)} cx="${x}" cy="${y}" r="6"/>`).join('');
 else if(targets.some(i=>typeof i==='number'&&i>=12))markup=[[12,22,9],[13,22,35],[14,9,22],[15,35,22]].map(([i,x,y])=>`<rect${has(i)} x="${x-5}" y="${y-5}" width="10" height="10" rx="2"/>`).join('');
 else if(targets.includes('left-stick')||targets.includes('right-stick'))markup=`<circle cx="22" cy="22" r="17"/><circle class="is-target" cx="22" cy="22" r="10"/>`;
 else markup=`<path d="M8 16 Q8 10 15 10 H29 Q36 10 36 16 L40 32 Q40 38 34 34 L28 28 H16 L10 34 Q4 38 4 32Z"/>${[4,5,6,7].map(i=>`<rect${has(i)} x="${i%2?27:7}" y="${i<6?10:3}" width="10" height="5" rx="2"/>`).join('')}${[8,9].map(i=>`<rect${has(i)} x="${i===8?15:25}" y="18" width="5" height="4" rx="1"/>`).join('')}`;
 const root=svg(markup,'0 0 44 44');root.classList.add('sv-control-icon');return root;
}
