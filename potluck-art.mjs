// Small original vector scenes, rendered locally without image downloads.
export function foodArt(type='main',label='料理插畫'){
 const scenes={
  main:'<ellipse cx="100" cy="114" rx="73" ry="25" fill="#fffaf2" stroke="#d9b89a" stroke-width="3"/><path d="M49 108c-10-42 37-68 65-48 38-9 55 46 18 57-26 11-61 5-83-9" fill="#c97943"/><path d="m113 81 31-28 10 9-28 30" fill="#dba56b"/><circle cx="151" cy="54" r="10" fill="#fff0d6"/><circle cx="159" cy="62" r="9" fill="#fff0d6"/><path d="M58 100q15-32 42-26" fill="none" stroke="#f2b77a" stroke-width="8" stroke-linecap="round"/><path d="m46 115-15-10 2 18m108-1 20-10-4 17" fill="#789865"/>',
  vegetable:'<ellipse cx="100" cy="120" rx="70" ry="20" fill="#fffaf2" stroke="#d9b89a" stroke-width="3"/><path d="M40 106q57 53 119 0" fill="#d2dca5" stroke="#6f8b57" stroke-width="3"/><circle cx="71" cy="90" r="25" fill="#7e9d61"/><circle cx="112" cy="89" r="27" fill="#9ab573"/><circle cx="142" cy="100" r="16" fill="#6b925a"/><circle cx="87" cy="108" r="12" fill="#d77450"/><circle cx="126" cy="111" r="10" fill="#edb55c"/>',
  rice:'<path d="M39 97h122q-3 48-61 48T39 97" fill="#de895b"/><ellipse cx="100" cy="97" rx="61" ry="20" fill="#fff1ce"/><path d="M50 92q4-39 50-40 46 0 50 40" fill="#fffaf0"/><path d="m79 77 9-5m8 15 9-5m8-11 8 4m-55 10 7 3" stroke="#dbc7a1" stroke-width="4" stroke-linecap="round"/><path d="m137 49 22-24m-12 30 23-23" stroke="#7e4c30" stroke-width="5" stroke-linecap="round"/>',
  soup:'<path d="M38 94h123q-5 51-61 51T38 94" fill="#f2c67f" stroke="#c08145" stroke-width="3"/><ellipse cx="100" cy="94" rx="61" ry="18" fill="#b56336"/><ellipse cx="100" cy="92" rx="49" ry="11" fill="#e9ad5c"/><path d="m78 91 14-4m20 10 11-3" stroke="#7c994f" stroke-width="6" stroke-linecap="round"/><path d="M75 64q-13-13 0-27m27 27q-13-13 0-27m27 27q-13-13 0-27" stroke="#d8b99e" stroke-width="4" fill="none" stroke-linecap="round"/>',
  dessert:'<ellipse cx="100" cy="132" rx="68" ry="16" fill="#fff8ef" stroke="#d9b89a" stroke-width="3"/><path d="m51 119 1-49 93 19v43Z" fill="#f2c285"/><path d="m52 91 92 22v-15L52 77" fill="#fff9ed"/><path d="m51 70 37-29 57 48Z" fill="#fbe8cb"/><path d="m89 40 11-17 16 5 4 19" fill="#d96950"/><path d="m100 23 5-11 8 10" fill="#6e915c"/>',
  drink:'<path d="m62 47 8 94h64l8-94Z" fill="#f5d99e" stroke="#bc8d60" stroke-width="3"/><path d="m69 79 6 56h54l5-56Z" fill="#e9a04d"/><ellipse cx="102" cy="47" rx="40" ry="10" fill="#fff6e5" stroke="#bc8d60" stroke-width="3"/><path d="m112 86 15-65h21" fill="none" stroke="#6e8a5f" stroke-width="7" stroke-linecap="round"/><circle cx="79" cy="85" r="15" fill="#fbe1a0" stroke="#e4b96e" stroke-width="3"/>'
 };
 return `<svg class="food-art" viewBox="0 0 200 170" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">${scenes[type]||scenes.main}</svg>`;
}
export function tableArt(count=0){
 const foods=['main','vegetable','rice','soup','dessert','drink'].slice(0,Math.min(6,Math.ceil(count/2)));
 return `<svg class="table-art" viewBox="0 0 500 270" role="img" aria-label="小熊主廚迎接家人，一起預備感恩餐桌" xmlns="http://www.w3.org/2000/svg">
 <ellipse cx="250" cy="244" rx="205" ry="14" fill="#ead3b1" opacity=".55"/><path d="m67 171 13 73m353-73-13 73" stroke="#b37d55" stroke-width="15" stroke-linecap="round"/>
 <circle cx="250" cy="100" r="78" fill="#f8e4c5"/>
 <circle cx="203" cy="65" r="22" fill="#ba845b"/><circle cx="294" cy="65" r="22" fill="#ba845b"/><circle cx="203" cy="65" r="12" fill="#e5b88b"/><circle cx="294" cy="65" r="12" fill="#e5b88b"/>
 <ellipse cx="250" cy="103" rx="65" ry="56" fill="#cb9669"/>
 <path d="M216 56V35q-22-2-20-19 3-20 27-11 14-20 31-3 25-10 35 7 20 0 17 17-2 13-22 11v19" fill="#fffcf4" stroke="#e4cba9" stroke-width="3"/>
 <path d="M217 49h67" stroke="#e4cba9" stroke-width="3"/><ellipse cx="250" cy="120" rx="29" ry="23" fill="#f5dcb9"/>
 <circle cx="226" cy="99" r="4" fill="#5e3824"/><circle cx="275" cy="99" r="4" fill="#5e3824"/><ellipse cx="250" cy="115" rx="7" ry="5" fill="#5e3824"/><path d="M250 120v5q-7 10-14 0m14 0q7 10 14 0" fill="none" stroke="#5e3824" stroke-width="3" stroke-linecap="round"/>
 <ellipse cx="212" cy="116" rx="9" ry="5" fill="#e3a080"/><ellipse cx="288" cy="116" rx="9" ry="5" fill="#e3a080"/>
 <path d="M207 149q43-21 87 0l12 48H195Z" fill="#fffaf0"/><path d="m223 148 27 15 25-15" fill="#ce7752"/>
 <ellipse cx="177" cy="156" rx="24" ry="14" transform="rotate(-22 177 156)" fill="#cb9669"/><ellipse cx="322" cy="156" rx="24" ry="14" transform="rotate(22 322 156)" fill="#cb9669"/>
 <rect x="48" y="175" width="404" height="42" rx="15" fill="#c68c60"/><path d="M54 175h392v28H54Z" fill="#f4c9a0"/><path d="M70 188h360" stroke="#e6ae82" stroke-width="2"/>
 ${[0,1,2,3,4,5].map(i=>`<ellipse cx="${92+i*63}" cy="177" rx="28" ry="9" fill="#fff8eb" stroke="#d1aa80"/>`).join('')}
 ${foods.map((type,i)=>`<g transform="translate(${62+i*63} 124) scale(.31)">${foodArt(type).replace(/<svg[^>]*>|<\/svg>/g,'')}</g>`).join('')}
 <path d="m85 53 12-18 2 13 17-3-10 14 11 9-20 1-6 17-4-18-15-3Z" fill="#dc9761" opacity=".8"/><path d="m400 94 6-17 8 12 16-2-9 13 5 14-17-5-10 13-1-19-13-7Z" fill="#b1b77a"/>
 </svg>`;
}
