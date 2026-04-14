// Adicione esta variável no início do script
let hoveredPerk = null;

// Substitua a função drawSkillTree
function drawSkillTree() {
    if (!canvas) return;
    canvas.width = 800;
    canvas.height = 600;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Desenha linhas
    for (const perk of currentPerks) {
        if (perk.required_perk_id) {
            const required = currentPerks.find(p => p.id === perk.required_perk_id);
            if (required) {
                ctx.beginPath();
                ctx.moveTo(required.pos_x, required.pos_y);
                ctx.lineTo(perk.pos_x, perk.pos_y);
                ctx.strokeStyle = '#d4af37';
                ctx.lineWidth = 3;
                ctx.stroke();
            }
        }
    }
    // Desenha perks
    for (const perk of currentPerks) {
        ctx.beginPath();
        ctx.arc(perk.pos_x, perk.pos_y, 22, 0, 2 * Math.PI);
        ctx.fillStyle = perk.is_purchased ? '#e6b422' : '#1f2a38';
        ctx.fill();
        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        // Ícone de coroa se for topo
        ctx.fillStyle = perk.is_purchased ? '#fff2c4' : '#c0b280';
        ctx.font = 'bold 14px "Cinzel"';
        ctx.fillText(perk.name, perk.pos_x - 18, perk.pos_y - 15);
        ctx.font = '12px "Cinzel"';
        ctx.fillStyle = '#f5d742';
        ctx.fillText(`⚡ ${perk.cost}`, perk.pos_x - 10, perk.pos_y + 28);
        if (perk.required_perk_id && !perk.is_purchased) {
            ctx.fillStyle = '#c49a2b';
            ctx.font = '18px "Segoe UI"';
            ctx.fillText('🔒', perk.pos_x + 18, perk.pos_y - 18);
        }
    }
    // Tooltip
    if (hoveredPerk) {
        ctx.font = '14px "Cinzel"';
        ctx.fillStyle = '#fff8e7';
        ctx.shadowBlur = 0;
        ctx.fillText(hoveredPerk.description || 'Sem descrição', hoveredPerk.pos_x + 25, hoveredPerk.pos_y - 10);
    }
}

// Adicione evento de movimento do mouse no canvas
skillCanvas.addEventListener('mousemove', (e) => {
    const rect = skillCanvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;
    hoveredPerk = currentPerks.find(p => Math.hypot(p.pos_x - mouseX, p.pos_y - mouseY) < 22);
    drawSkillTree();
});
skillCanvas.addEventListener('mouseleave', () => {
    hoveredPerk = null;
    drawSkillTree();
});
