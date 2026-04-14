// Estado global
let currentTree = null;
let currentPerks = [];
let currentPoints = 0;
let isAdminMode = false;
let ctx = null;
let canvas = null;
let hoveredPerk = null;

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

// Carregar lista de árvores
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
    if (!valid) {
        alert('Senha incorreta!');
        return;
    }
    treePasswordModal.style.display = 'none';
    currentTree = pendingTreeId;
    await loadTreePerks(currentTree);
    treeViewModal.style.display = 'block';
    treePasswordInput.value = '';
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
    canvas.width = 800;
    canvas.height = 600;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Desenha linhas de conexão
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
    
    // Desenha os perks
    for (const perk of currentPerks) {
        ctx.beginPath();
        ctx.arc(perk.pos_x, perk.pos_y, 22, 0, 2 * Math.PI);
        ctx.fillStyle = perk.is_purchased ? '#e6b422' : '#1f2a38';
        ctx.fill();
        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        
        ctx.fillStyle = perk.is_purchased ? '#fff2c4' : '#c0b280';
        ctx.font = 'bold 12px "Cinzel"';
        ctx.fillText(perk.name, perk.pos_x - 18, perk.pos_y - 15);
        ctx.font = '11px "Cinzel"';
        ctx.fillStyle = '#f5d742';
        ctx.fillText(`⚡ ${perk.cost}`, perk.pos_x - 10, perk.pos_y + 28);
        
        if (perk.required_perk_id && !perk.is_purchased) {
            ctx.fillStyle = '#c49a2b';
            ctx.font = '16px "Segoe UI"';
            ctx.fillText('🔒', perk.pos_x + 18, perk.pos_y - 18);
        }
    }
    
    // Tooltip do hover
    if (hoveredPerk) {
        ctx.font = '12px "Cinzel"';
        ctx.fillStyle = '#fff8e7';
        ctx.shadowBlur = 0;
        ctx.fillText(hoveredPerk.description || 'Sem descrição', hoveredPerk.pos_x + 25, hoveredPerk.pos_y - 10);
    }
}

// Eventos do mouse para tooltip
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

skillCanvas.addEventListener('click', async (e) => {
    if (!currentTree) return;
    const rect = skillCanvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;
    const clickedPerk = currentPerks.find(p => Math.hypot(p.pos_x - mouseX, p.pos_y - mouseY) < 22);
    if (!clickedPerk) return;
    if (clickedPerk.is_purchased) {
        alert('Você já possui esse perk!');
        return;
    }
    try {
        await api('/api/purchase', { method: 'POST', body: { perkId: clickedPerk.id } });
        await loadTreePerks(currentTree);
    } catch (err) {
        alert('Erro: ' + err.message);
    }
});

// ========== ADMIN ==========
adminBtn.onclick = () => {
    adminModal.style.display = 'block';
    adminPassword.value = '';
    adminPanel.style.display = 'none';
};

loginAdminBtn.onclick = async () => {
    if (adminPassword.value === 'Admin') {
        isAdminMode = true;
        adminPanel.style.display = 'block';
        await loadAdminTrees();
        await loadAdminPerks();
        alert('Modo admin ativado');
    } else {
        alert('Senha incorreta');
    }
};

async function loadAdminTrees() {
    const trees = await api('/api/admin/trees');
    const container = document.getElementById('admin-trees-list');
    container.innerHTML = '';
    for (const t of trees) {
        const div = document.createElement('div');
        div.innerHTML = `
            <strong>${t.name}</strong> (senha: ${t.password})
            <button onclick="editTree(${t.id}, '${t.name}', '${t.password}')">✏️</button>
            <button onclick="deleteTree(${t.id})">🗑️</button>
        `;
        container.appendChild(div);
    }
}

window.editTree = (id, name, password) => {
    document.getElementById('tree-form-title').innerText = 'Editar Árvore';
    document.getElementById('tree-name-input').value = name;
    document.getElementById('tree-password-input').value = password;
    const modal = document.getElementById('tree-form-modal');
    modal.style.display = 'block';
    document.getElementById('save-tree-btn').onclick = async () => {
        const newName = document.getElementById('tree-name-input').value;
        const newPass = document.getElementById('tree-password-input').value;
        await api(`/api/admin/trees/${id}`, { method: 'PUT', body: { name: newName, password: newPass } });
        modal.style.display = 'none';
        loadAdminTrees();
        loadTrees();
    };
};

window.deleteTree = async (id) => {
    if (confirm('Remover árvore e todos os perks?')) {
        await api(`/api/admin/trees/${id}`, { method: 'DELETE' });
        loadAdminTrees();
        loadTrees();
    }
};

document.getElementById('new-tree-btn').onclick = () => {
    document.getElementById('tree-form-title').innerText = 'Nova Árvore';
    document.getElementById('tree-name-input').value = '';
    document.getElementById('tree-password-input').value = '';
    const modal = document.getElementById('tree-form-modal');
    modal.style.display = 'block';
    document.getElementById('save-tree-btn').onclick = async () => {
        const name = document.getElementById('tree-name-input').value;
        const password = document.getElementById('tree-password-input').value;
        await api('/api/admin/trees', { method: 'POST', body: { name, password } });
        modal.style.display = 'none';
        loadAdminTrees();
        loadTrees();
    };
};

async function loadAdminPerks() {
    const perks = await api('/api/admin/perks');
    const container = document.getElementById('admin-perks-list');
    container.innerHTML = '';
    for (const p of perks) {
        const div = document.createElement('div');
        div.innerHTML = `
            <strong>${p.name}</strong> (Árvore: ${p.tree_name}) - Custo: ${p.cost} - Pos (${p.pos_x},${p.pos_y})
            <button onclick="editPerk(${p.id})">✏️</button>
            <button onclick="deletePerk(${p.id})">🗑️</button>
        `;
        container.appendChild(div);
    }
}

window.editPerk = async (id) => {
    const perks = await api('/api/admin/perks');
    const perk = perks.find(p => p.id === id);
    if (!perk) return;
    document.getElementById('perk-form-title').innerText = 'Editar Perk';
    document.getElementById('perk-name').value = perk.name;
    document.getElementById('perk-desc').value = perk.description || '';
    document.getElementById('perk-cost').value = perk.cost;
    document.getElementById('perk-pos-x').value = perk.pos_x;
    document.getElementById('perk-pos-y').value = perk.pos_y;
    await populateTreeSelect(perk.tree_id);
    await populateRequiredSelect(perk.tree_id, perk.required_perk_id);
    const modal = document.getElementById('perk-form-modal');
    modal.style.display = 'block';
    document.getElementById('save-perk-btn').onclick = async () => {
        const data = {
            name: document.getElementById('perk-name').value,
            description: document.getElementById('perk-desc').value,
            cost: parseInt(document.getElementById('perk-cost').value),
            pos_x: parseInt(document.getElementById('perk-pos-x').value),
            pos_y: parseInt(document.getElementById('perk-pos-y').value),
            required_perk_id: document.getElementById('perk-required').value || null,
            tree_id: document.getElementById('perk-tree-select').value
        };
        await api(`/api/admin/perks/${id}`, { method: 'PUT', body: data });
        modal.style.display = 'none';
        loadAdminPerks();
    };
};

window.deletePerk = async (id) => {
    if (confirm('Remover perk?')) {
        await api(`/api/admin/perks/${id}`, { method: 'DELETE' });
        loadAdminPerks();
    }
};

document.getElementById('new-perk-btn').onclick = async () => {
    document.getElementById('perk-form-title').innerText = 'Novo Perk';
    document.getElementById('perk-name').value = '';
    document.getElementById('perk-desc').value = '';
    document.getElementById('perk-cost').value = 1;
    document.getElementById('perk-pos-x').value = 400;
    document.getElementById('perk-pos-y').value = 300;
    await populateTreeSelect();
    await populateRequiredSelect();
    const modal = document.getElementById('perk-form-modal');
    modal.style.display = 'block';
    document.getElementById('save-perk-btn').onclick = async () => {
        const data = {
            tree_id: document.getElementById('perk-tree-select').value,
            name: document.getElementById('perk-name').value,
            description: document.getElementById('perk-desc').value,
            cost: parseInt(document.getElementById('perk-cost').value),
            pos_x: parseInt(document.getElementById('perk-pos-x').value),
            pos_y: parseInt(document.getElementById('perk-pos-y').value),
            required_perk_id: document.getElementById('perk-required').value || null
        };
        await api('/api/admin/perks', { method: 'POST', body: data });
        modal.style.display = 'none';
        loadAdminPerks();
    };
};

async function populateTreeSelect(selectedId = null) {
    const trees = await api('/api/trees');
    const select = document.getElementById('perk-tree-select');
    select.innerHTML = '';
    for (const t of trees) {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.text = t.name;
        if (selectedId == t.id) opt.selected = true;
        select.appendChild(opt);
    }
}

async function populateRequiredSelect(treeId = null, selectedId = null) {
    if (!treeId && document.getElementById('perk-tree-select').value) {
        treeId = document.getElementById('perk-tree-select').value;
    }
    if (!treeId) return;
    const perks = await api(`/api/trees/${treeId}/perks`);
    const select = document.getElementById('perk-required');
    select.innerHTML = '<option value="">Nenhum</option>';
    for (const p of perks.perks) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.text = p.name;
        if (selectedId == p.id) opt.selected = true;
        select.appendChild(opt);
    }
}

document.getElementById('perk-tree-select').addEventListener('change', () => {
    populateRequiredSelect();
});

document.getElementById('add-points').onclick = async () => {
    await api('/api/admin/add-points', { method: 'POST', body: { amount: 5 } });
    alert('Pontos adicionados');
    if (currentTree) await loadTreePerks(currentTree);
};

document.getElementById('remove-points').onclick = async () => {
    await api('/api/admin/remove-points', { method: 'POST', body: { amount: 5 } });
    alert('Pontos removidos');
    if (currentTree) await loadTreePerks(currentTree);
};

document.getElementById('reset-perks').onclick = async () => {
    if (confirm('Resetar todos os perks comprados?')) {
        await api('/api/admin/reset-perks', { method: 'POST' });
        alert('Resetado');
        if (currentTree) await loadTreePerks(currentTree);
    }
};

// Fechar modais
document.querySelectorAll('.close').forEach(el => {
    el.onclick = () => {
        document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    };
});

// Inicialização
window.onload = async () => {
    canvas = skillCanvas;
    ctx = canvas.getContext('2d');
    await loadTrees();
};
