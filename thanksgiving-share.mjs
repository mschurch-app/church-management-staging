const url='https://mscos.mchurch.online/thanksgiving-2026.html';
document.getElementById('copyLetter').addEventListener('click',async()=>{const s=document.getElementById('shareStatus');try{await navigator.clipboard.writeText(url);s.textContent='已複製信件網址，可以貼給朋友。';}catch{s.textContent='請複製此網址：'+url;}});
