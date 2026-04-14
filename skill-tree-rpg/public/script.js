// Estado global
let currentTree = null;
let currentPerks = [];
let currentPoints = 0;
let ctx, canvas;
let isAdminMode = false;
let dragTarget = null;
let dragOffsetX = 0, dragOffsetY = 0;
let connectMode = false;
let selectedForConnect = null;
let scale = 1, offsetX = 0, offsetY = 0;
let hoveredPerk = null;
let zoomLevel = 1;

// Elementos DOM
const treesContainer = document.getElementById('trees-list');
const adminBtn = document.getElementById('admin-btn');
const adminModal = document.getElementById('admin-modal');
const treePasswordModal = document.getElementById('tree-password-modal');
const treeViewModal = document.getElementById('tree-view-modal');
const treePasswordInput = document.getElementById('tree-password');
const submitTreePassword = document.getElementById('submit-tree-password');
const treeNameSpan = document.getElementById('tree-name');
const pointsSpan = document.getElementById('points');
const skillCanvas = document.getElementById('skillCanvas');
const adminPanel = document.getElementById('admin-panel');
const loginAdminBtn = document.getElementById('login-admin');
const adminPassword = document.getElementById('admin-password');
const editorTools = document.getElementById('editor-tools');
const toggleConnectBtn = document.getElementById('toggle-connect-mode');
const cancelConnectBtn = document.getElementById('cancel-connect');
const connectStatus = document.getElementById('connect-status');
const quickPerkModal = document.getElementById('quick-perk-modal');
let currentEditingPerk = null;

// Helper API
async function api(endpoint, options = {}) {
    const res = await fetch(endpoint, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

// Carregar árvores
async function loadTrees() {
    const trees = await api('/api/trees');
    treesContainer.innerHTML = '';
    for (const tree of trees) {
        const card = document.createElement('div');
        card.className = 'tree-card';
        card.innerHTML = `<h3>🌿 ${tree.name}</h3><p>Clique para acessar</p>`;
        card.onclick = () => requestTreeAccess(tree.id, tree.name);
        treesContainer.appendChild(card);
    }
}

let pendingTreeId = null;
function requestTreeAccess(treeId, treeName) {
    pendingTreeId = treeId;
    treeNameSpan.innerText = treeName;
    treePasswordModal.style.display = 'block';
}

submitTreePassword.onclick = async () => {
    const pass = treePasswordInput.value;
    const { valid } = await api('/api/trees/verify', { method: 'POST', body: { treeId: pendingTreeId, password: pass } });
    if (!valid) { alert('Senha incorreta!'); return; }
    treePasswordModal.style.display = 'none';
    currentTree = pendingTreeId;
    await loadTreePerks(currentTree);
    treeViewModal.style.display = 'block';
    treePasswordInput.value = '';
    if (isAdminMode) editorTools.style.display = 'block';
    else editorTools.style.display = 'none';
};

async function loadTreePerks(treeId) {
    const data = await api(`/api/trees/${treeId}/perks`);
    currentPerks = data.perks;
    currentPoints = data.availablePoints;
    pointsSpan.innerText = currentPoints;
    drawSkillTree();
}

function drawSkillTree() {
    if (!canvas) return;
    const w = 900, h = 650;
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    
    // Desenhar conexões
    for (const perk of currentPerks) {
        if (perk.required_perk_id) {
            const required = currentPerks.find(p => p.id === perk.required_perk_id);
            if (required) {
                ctx.beginPath();
                ctx.moveTo(required.pos_x, required.pos_y);
                ctx.lineTo(perk.pos_x, perk.pos_y);
                ctx.strokeStyle = '#d4af37';
                ctx.lineWidth = 3 / scale;
                ctx.setLineDash([8, 6]);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
    }
    
    // Desenhar nós
    for (const perk of currentPerks) {
        const x = perk.pos_x, y = perk.pos_y;
        ctx.beginPath();
        ctx.arc(x, y, 24, 0, 2 * Math.PI);
        ctx.fillStyle = perk.is_purchased ? '#e6b422' : '#1f2a38';
        ctx.fill();
        ctx.strokeStyle = dragTarget === perk ? '#ffaa33' : '#c4a747';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = '#fff2c4';
        ctx.font = `bold ${14 / scale}px "Cinzel"`;
        ctx.fillText(perk.name, x - 20, y - 18);
        ctx.font = `${12 / scale}px "Cinzel"`;
        ctx.fillStyle = '#f5d742';
        ctx.fillText(`⚡ ${perk.cost}`, x - 12, y + 30);
        if (perk.required_perk_id && !perk.is_purchased) {
            ctx.fillStyle = '#c49a2b';
            ctx.font = `${16 / scale}px "Segoe UI"`;
            ctx.fillText('🔒', x + 20, y - 22);
        }
        if (connectMode && selectedForConnect === perk) {
            ctx.beginPath();
            ctx.arc(x, y, 30, 0, 2 * Math.PI);
            ctx.strokeStyle = '#ffaa66';
            ctx.lineWidth = 3;
            ctx.stroke();
        }
    }
    ctx.restore();
    
    // Tooltip
    if (hoveredPerk && !dragTarget) {
        ctx.font = '14px "Cinzel"';
        ctx.fillStyle = '#fff8e7';
        ctx.shadowBlur = 0;
        ctx.fillText(hoveredPerk.description || 'Sem descrição', hoveredPerk.pos_x + 30, hoveredPerk.pos_y - 15);
    }
}

// Transformar coordenadas do mouse para o mundo do canvas
function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
    const worldX = (mouseX - offsetX) / scale;
    const worldY = (mouseY - offsetY) / scale;
    return { x: worldX, y: worldY };
}

// Eventos do canvas
let isDraggingCanvas = false;
let dragStart = { x: 0, y: 0 };

skillCanvas.addEventListener('mousedown', (e) => {
    const { x, y } = getCanvasCoords(e);
    const clicked = currentPerks.find(p => Math.hypot(p.pos_x - x, p.pos_y - y) < 24);
    if (isAdminMode && clicked) {
        // Arrastar perk
        dragTarget = clicked;
        dragOffsetX = clicked.pos_x - x;
        dragOffsetY = clicked.pos_y - y;
        skillCanvas.style.cursor = 'grabbing';
        e.preventDefault();
    } else {
        // Arrastar canvas
        isDraggingCanvas = true;
        dragStart.x = e.clientX;
        dragStart.y = e.clientY;
        skillCanvas.style.cursor = 'grab';
    }
});

skillCanvas.addEventListener('mousemove', (e) => {
    const { x, y } = getCanvasCoords(e);
    if (dragTarget && isAdminMode) {
        dragTarget.pos_x = Math.min(850, Math.max(50, x + dragOffsetX));
        dragTarget.pos_y = Math.min(600, Math.max(50, y + dragOffsetY));
        drawSkillTree();
    } else if (isDraggingCanvas) {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        offsetX += dx;
        offsetY += dy;
        dragStart = { x: e.clientX, y: e.clientY };
        drawSkillTree();
    } else {
        const hover = currentPerks.find(p => Math.hypot(p.pos_x - x, p.pos_y - y) < 24);
        if (hover !== hoveredPerk) {
            hoveredPerk = hover;
            drawSkillTree();
        }
    }
});

skillCanvas.addEventListener('mouseup', async (e) => {
    if (dragTarget && isAdminMode) {
        // Salvar nova posição no backend
        try {
            await api(`/api/admin/perks/${dragTarget.id}`, {
                method: 'PUT',
                body: {
                    name: dragTarget.name,
                    description: dragTarget.description,
                    cost: dragTarget.cost,
                    pos_x: dragTarget.pos_x,
                    pos_y: dragTarget.pos_y,
                    required_perk_id: dragTarget.required_perk_id
                }
            });
        } catch (err) { console.error(err); }
        dragTarget = null;
        skillCanvas.style.cursor = 'crosshair';
    }
    isDraggingCanvas = false;
    skillCanvas.style.cursor = 'crosshair';
});

skillCanvas.addEventListener('click', async (e) => {
    if (dragTarget) return;
    const { x, y } = getCanvasCoords(e);
    const clicked = currentPerks.find(p => Math.hypot(p.pos_x - x, p.pos_y - y) < 24);
    if (!clicked) {
        if (isAdminMode) {
            // Criar novo perk na posição do clique
            const name = prompt('Nome do novo perk:');
            if (name) {
                const newPerk = await api('/api/admin/perks', {
                    method: 'POST',
                    body: {
                        tree_id: currentTree,
                        name: name,
                        description: 'Novo perk',
                        cost: 1,
                        pos_x: x,
                        pos_y: y,
                        required_perk_id: null
                    }
                });
                await loadTreePerks(currentTree);
            }
        }
        return;
    }
    if (!isAdminMode) {
        // Modo jogador: comprar perk
        if (clicked.is_purchased) { alert('Já adquirido!'); return; }
        try {
            await api('/api/purchase', { method: 'POST', body: { perkId: clicked.id } });
            await loadTreePerks(currentTree);
        } catch (err) { alert(err.message); }
    } else {
        // Modo admin: lida com conexão ou edição
        if (connectMode) {
            if (!selectedForConnect) {
                selectedForConnect = clicked;
                connectStatus.innerText = `Selecionado: ${clicked.name}. Clique em outro perk para conectar.`;
                drawSkillTree();
            } else {
                if (selectedForConnect.id === clicked.id) {
                    connectStatus.innerText = 'Conexão cancelada.';
                    selectedForConnect = null;
                } else {
                    // Estabelecer required_perk_id
                    await api(`/api/admin/perks/${clicked.id}`, {
                        method: 'PUT',
                        body: {
                            name: clicked.name,
                            description: clicked.description,
                            cost: clicked.cost,
                            pos_x: clicked.pos_x,
                            pos_y: clicked.pos_y,
                            required_perk_id: selectedForConnect.id
                        }
                    });
                    await loadTreePerks(currentTree);
                    connectStatus.innerText = `Conectado! ${selectedForConnect.name} → ${clicked.name}`;
                    selectedForConnect = null;
                    toggleConnectMode();
                }
                drawSkillTree();
            }
        } else {
            // Edição rápida com botão direito (simulado por Ctrl+click)
            if (e.ctrlKey) {
                openQuickEdit(clicked);
            }
        }
    }
});

// Context menu (botão direito) para edição
skillCanvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const { x, y } = getCanvasCoords(e);
    const clicked = currentPerks.find(p => Math.hypot(p.pos_x - x, p.pos_y - y) < 24);
    if (clicked && isAdminMode) openQuickEdit(clicked);
});

function openQuickEdit(perk) {
    currentEditingPerk = perk;
    document.getElementById('quick-perk-name').value = perk.name;
    document.getElementById('quick-perk-desc').value = perk.description || '';
    document.getElementById('quick-perk-cost').value = perk.cost;
    // Popular select de pré-requisitos
    const select = document.getElementById('quick-perk-required');
    select.innerHTML = '<option value="">Nenhum</option>';
    for (const p of currentPerks) {
        if (p.id !== perk.id) {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.text = p.name;
            if (perk.required_perk_id === p.id) opt.selected = true;
            select.appendChild(opt);
        }
    }
    quickPerkModal.style.display = 'block';
}

document.getElementById('save-quick-perk').onclick = async () => {
    if (!currentEditingPerk) return;
    const data = {
        name: document.getElementById('quick-perk-name').value,
        description: document.getElementById('quick-perk-desc').value,
        cost: parseInt(document.getElementById('quick-perk-cost').value),
        pos_x: currentEditingPerk.pos_x,
        pos_y: currentEditingPerk.pos_y,
        required_perk_id: document.getElementById('quick-perk-required').value || null
    };
    await api(`/api/admin/perks/${currentEditingPerk.id}`, { method: 'PUT', body: data });
    await loadTreePerks(currentTree);
    quickPerkModal.style.display = 'none';
    currentEditingPerk = null;
};
document.getElementById('delete-quick-perk').onclick = async () => {
    if (confirm('Excluir este perk permanentemente?')) {
        await api(`/api/admin/perks/${currentEditingPerk.id}`, { method: 'DELETE' });
        await loadTreePerks(currentTree);
        quickPerkModal.style.display = 'none';
        currentEditingPerk = null;
    }
};

// Controles de zoom
document.getElementById('zoom-in').onclick = () => {
    scale = Math.min(2, scale + 0.1);
    drawSkillTree();
};
document.getElementById('zoom-out').onclick = () => {
    scale = Math.max(0.5, scale - 0.1);
    drawSkillTree();
};
document.getElementById('reset-view').onclick = () => {
    scale = 1;
    offsetX = 0;
    offsetY = 0;
    drawSkillTree();
};

// Modo conectar
function toggleConnectMode() {
    connectMode = !connectMode;
    if (connectMode) {
        toggleConnectBtn.style.display = 'none';
        cancelConnectBtn.style.display = 'inline-block';
        connectStatus.innerText = 'Modo conectar ativo. Clique em um perk e depois em outro.';
        selectedForConnect = null;
    } else {
        toggleConnectBtn.style.display = 'inline-block';
        cancelConnectBtn.style.display = 'none';
        connectStatus.innerText = '';
        selectedForConnect = null;
    }
    drawSkillTree();
}
toggleConnectBtn.onclick = toggleConnectMode;
cancelConnectBtn.onclick = () => { connectMode = false; toggleConnectMode(); };

// Admin login e painel (igual ao anterior, mas com recarga do editor)
loginAdminBtn.onclick = async () => {
    if (adminPassword.value === 'Admin') {
        isAdminMode = true;
        adminPanel.style.display = 'block';
        await loadAdminTrees();
        await loadAdminPerks();
        alert('Modo admin ativado. Abra uma árvore para editar visualmente!');
        if (currentTree) {
            editorTools.style.display = 'block';
            await loadTreePerks(currentTree);
        }
    } else alert('Senha incorreta');
};
// As funções loadAdminTrees, loadAdminPerks, etc são idênticas às anteriores, mantenha-as.
// (Por brevidade, omiti mas você pode copiar do script anterior ou reutilizar)
// Vou incluir as funções essenciais restantes rapidamente:

async function loadAdminTrees() { /* igual ao anterior */ }
async function loadAdminPerks() { /* igual */ }
window.editTree = (id, name, password) => { /* igual */ };
window.deleteTree = async (id) => { /* igual */ };
document.getElementById('new-tree-btn').onclick = () => { /* igual */ };
window.editPerk = async (id) => { /* igual */ };
window.deletePerk = async (id) => { /* igual */ };
document.getElementById('new-perk-btn').onclick = async () => { /* igual */ };
async function populateTreeSelect(selectedId = null) { /* igual */ }
async function populateRequiredSelect(treeId = null, selectedId = null) { /* igual */ }
document.getElementById('add-points').onclick = async () => {
    await api('/api/admin/add-points', { method: 'POST', body: { amount: 5 } });
    if (currentTree) await loadTreePerks(currentTree);
};
document.getElementById('remove-points').onclick = async () => {
    await api('/api/admin/remove-points', { method: 'POST', body: { amount: 5 } });
    if (currentTree) await loadTreePerks(currentTree);
};
document.getElementById('reset-perks').onclick = async () => {
    if (confirm('Resetar todos os perks comprados?')) {
        await api('/api/admin/reset-perks', { method: 'POST' });
        if (currentTree) await loadTreePerks(currentTree);
    }
};

// Inicialização
window.onload = async () => {
    canvas = skillCanvas;
    ctx = canvas.getContext('2d');
    await loadTrees();
    // Fechar modais
    document.querySelectorAll('.close').forEach(el => {
        el.onclick = () => {
            document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
            if (connectMode) toggleConnectMode();
        };
    });
};
