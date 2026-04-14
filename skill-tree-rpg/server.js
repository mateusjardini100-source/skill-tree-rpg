const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.json());
app.use(express.static('public'));

async function initDB() {
  const client = await pool.connect();
  try {
    // Criar tabelas
    await client.query(`
      CREATE TABLE IF NOT EXISTS skill_trees (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        password TEXT NOT NULL
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS perks (
        id SERIAL PRIMARY KEY,
        tree_id INTEGER REFERENCES skill_trees(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        cost INTEGER DEFAULT 1,
        pos_x INTEGER DEFAULT 0,
        pos_y INTEGER DEFAULT 0,
        required_perk_id INTEGER REFERENCES perks(id) ON DELETE SET NULL
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS player (
        id INTEGER PRIMARY KEY DEFAULT 1,
        available_points INTEGER DEFAULT 0
      );
    `);
    await client.query(`
      INSERT INTO player (id, available_points) VALUES (1, 0)
      ON CONFLICT (id) DO NOTHING;
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS purchased_perks (
        player_id INTEGER REFERENCES player(id),
        perk_id INTEGER REFERENCES perks(id) ON DELETE CASCADE,
        PRIMARY KEY (player_id, perk_id)
      );
    `);

    // Inserir árvores de exemplo se não existirem
    const treeCount = await client.query('SELECT COUNT(*) FROM skill_trees');
    if (parseInt(treeCount.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO skill_trees (name, password) VALUES 
        ('🔥 Destruição', 'fire123'),
        ('🏹 Furtividade', 'stealth'),
        ('🔮 Ilusão', 'illusion');
      `);
    }

    // Buscar IDs das árvores
    const trees = await client.query('SELECT id, name FROM skill_trees');
    const treeMap = {};
    trees.rows.forEach(t => { treeMap[t.name] = t.id; });

    // Inserir perks de exemplo (se não houver perks)
    const perkCount = await client.query('SELECT COUNT(*) FROM perks');
    if (parseInt(perkCount.rows[0].count) === 0) {
      // Perks para Destruição
      const destruicaoId = treeMap['🔥 Destruição'];
      if (destruicaoId) {
        const perksData = [
          { name: 'Chamas', desc: 'Lança uma chama que causa 10 de dano.', cost: 1, x: 100, y: 300, req: null },
          { name: 'Chama Intensa', desc: 'Chamas causam 50% mais dano.', cost: 2, x: 300, y: 200, req: 'Chamas' },
          { name: 'Rajada de Fogo', desc: 'Desbloqueia um cone de fogo.', cost: 2, x: 500, y: 300, req: 'Chama Intensa' },
          { name: 'Mestre do Fogo', desc: 'Magias de fogo custam 30% menos magicka.', cost: 3, x: 700, y: 400, req: 'Rajada de Fogo' },
          { name: 'Gelo Perfurante', desc: 'Projétil de gelo que lentifica.', cost: 1, x: 200, y: 500, req: null },
          { name: 'Pele de Gelo', desc: 'Aumenta armadura enquanto conjura gelo.', cost: 2, x: 400, y: 550, req: 'Gelo Perfurante' },
        ];
        for (const p of perksData) {
          let requiredId = null;
          if (p.req) {
            const reqRes = await client.query('SELECT id FROM perks WHERE name = $1 AND tree_id = $2', [p.req, destruicaoId]);
            if (reqRes.rows[0]) requiredId = reqRes.rows[0].id;
          }
          await client.query(
            `INSERT INTO perks (tree_id, name, description, cost, pos_x, pos_y, required_perk_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [destruicaoId, p.name, p.desc, p.cost, p.x, p.y, requiredId]
          );
        }
      }

      // Perks para Furtividade
      const furtividadeId = treeMap['🏹 Furtividade'];
      if (furtividadeId) {
        const perksData = [
          { name: 'Agachamento', desc: 'Fica mais difícil de ser detectado.', cost: 1, x: 100, y: 300, req: null },
          { name: 'Ataque Furtivo', desc: 'Ataques furtivos causam 2x mais dano.', cost: 2, x: 300, y: 200, req: 'Agachamento' },
          { name: 'Silêncio', desc: 'Andar agachado não faz barulho.', cost: 2, x: 500, y: 350, req: 'Ataque Furtivo' },
          { name: 'Sombra', desc: 'Ativa invisibilidade por 30s ao agachar.', cost: 3, x: 700, y: 450, req: 'Silêncio' },
        ];
        for (const p of perksData) {
          let requiredId = null;
          if (p.req) {
            const reqRes = await client.query('SELECT id FROM perks WHERE name = $1 AND tree_id = $2', [p.req, furtividadeId]);
            if (reqRes.rows[0]) requiredId = reqRes.rows[0].id;
          }
          await client.query(
            `INSERT INTO perks (tree_id, name, description, cost, pos_x, pos_y, required_perk_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [furtividadeId, p.name, p.desc, p.cost, p.x, p.y, requiredId]
          );
        }
      }

      // Perks para Ilusão
      const ilusaoId = treeMap['🔮 Ilusão'];
      if (ilusaoId) {
        const perksData = [
          { name: 'Medo', desc: 'Faz inimigos fugirem por 30s.', cost: 1, x: 150, y: 250, req: null },
          { name: 'Pânico', desc: 'Medo afeta inimigos de nível mais alto.', cost: 2, x: 350, y: 180, req: 'Medo' },
          { name: 'Invisibilidade', desc: 'Fica invisível por 60s.', cost: 3, x: 600, y: 300, req: null },
          { name: 'Silêncio Mágico', desc: 'Magias de ilusão são silenciosas.', cost: 2, x: 750, y: 500, req: 'Invisibilidade' },
        ];
        for (const p of perksData) {
          let requiredId = null;
          if (p.req) {
            const reqRes = await client.query('SELECT id FROM perks WHERE name = $1 AND tree_id = $2', [p.req, ilusaoId]);
            if (reqRes.rows[0]) requiredId = reqRes.rows[0].id;
          }
          await client.query(
            `INSERT INTO perks (tree_id, name, description, cost, pos_x, pos_y, required_perk_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [ilusaoId, p.name, p.desc, p.cost, p.x, p.y, requiredId]
          );
        }
      }
    }

  } catch (err) {
    console.error('Erro ao criar tabelas/dados:', err);
  } finally {
    client.release();
  }
}
initDB();

// ========== ROTAS DA API ==========

app.get('/api/trees', async (req, res) => {
  const result = await pool.query('SELECT id, name FROM skill_trees ORDER BY id');
  res.json(result.rows);
});

app.post('/api/trees/verify', async (req, res) => {
  const { treeId, password } = req.body;
  const result = await pool.query('SELECT password FROM skill_trees WHERE id = $1', [treeId]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Árvore não existe' });
  res.json({ valid: result.rows[0].password === password });
});

app.get('/api/trees/:id/perks', async (req, res) => {
  const treeId = req.params.id;
  const perks = await pool.query(`
    SELECT p.*, 
      CASE WHEN pp.perk_id IS NOT NULL THEN true ELSE false END as is_purchased
    FROM perks p
    LEFT JOIN purchased_perks pp ON pp.perk_id = p.id AND pp.player_id = 1
    WHERE p.tree_id = $1
    ORDER BY p.id
  `, [treeId]);
  const points = await pool.query('SELECT available_points FROM player WHERE id = 1');
  res.json({ perks: perks.rows, availablePoints: points.rows[0].available_points });
});

app.post('/api/purchase', async (req, res) => {
  const { perkId } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const already = await client.query('SELECT 1 FROM purchased_perks WHERE player_id = 1 AND perk_id = $1', [perkId]);
    if (already.rows.length > 0) throw new Error('Perk já adquirido');
    const perkData = await client.query('SELECT cost, required_perk_id FROM perks WHERE id = $1', [perkId]);
    if (perkData.rows.length === 0) throw new Error('Perk não existe');
    const { cost, required_perk_id } = perkData.rows[0];
    if (required_perk_id) {
      const reqPurchased = await client.query('SELECT 1 FROM purchased_perks WHERE player_id = 1 AND perk_id = $1', [required_perk_id]);
      if (reqPurchased.rows.length === 0) throw new Error('Pré‑requisito não atendido');
    }
    const playerPoints = await client.query('SELECT available_points FROM player WHERE id = 1');
    if (playerPoints.rows[0].available_points < cost) throw new Error('Pontos insuficientes');
    await client.query('UPDATE player SET available_points = available_points - $1 WHERE id = 1', [cost]);
    await client.query('INSERT INTO purchased_perks (player_id, perk_id) VALUES (1, $1)', [perkId]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.post('/api/admin/add-points', async (req, res) => {
  const { amount } = req.body;
  await pool.query('UPDATE player SET available_points = available_points + $1 WHERE id = 1', [amount]);
  const newPoints = await pool.query('SELECT available_points FROM player WHERE id = 1');
  res.json({ availablePoints: newPoints.rows[0].available_points });
});

app.post('/api/admin/remove-points', async (req, res) => {
  const { amount } = req.body;
  await pool.query('UPDATE player SET available_points = available_points - $1 WHERE id = 1', [amount]);
  const newPoints = await pool.query('SELECT available_points FROM player WHERE id = 1');
  res.json({ availablePoints: newPoints.rows[0].available_points });
});

app.post('/api/admin/reset-perks', async (req, res) => {
  await pool.query('DELETE FROM purchased_perks WHERE player_id = 1');
  res.json({ success: true });
});

app.get('/api/admin/trees', async (req, res) => {
  const result = await pool.query('SELECT * FROM skill_trees ORDER BY id');
  res.json(result.rows);
});

app.post('/api/admin/trees', async (req, res) => {
  const { name, password } = req.body;
  const result = await pool.query('INSERT INTO skill_trees (name, password) VALUES ($1, $2) RETURNING *', [name, password]);
  res.json(result.rows[0]);
});

app.put('/api/admin/trees/:id', async (req, res) => {
  const { name, password } = req.body;
  await pool.query('UPDATE skill_trees SET name = $1, password = $2 WHERE id = $3', [name, password, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/admin/trees/:id', async (req, res) => {
  await pool.query('DELETE FROM skill_trees WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

app.get('/api/admin/perks', async (req, res) => {
  const result = await pool.query(`
    SELECT p.*, t.name as tree_name 
    FROM perks p 
    JOIN skill_trees t ON p.tree_id = t.id
    ORDER BY p.id
  `);
  res.json(result.rows);
});

app.post('/api/admin/perks', async (req, res) => {
  const { tree_id, name, description, cost, pos_x, pos_y, required_perk_id } = req.body;
  const result = await pool.query(
    `INSERT INTO perks (tree_id, name, description, cost, pos_x, pos_y, required_perk_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [tree_id, name, description, cost, pos_x, pos_y, required_perk_id || null]
  );
  res.json(result.rows[0]);
});

app.put('/api/admin/perks/:id', async (req, res) => {
  const { name, description, cost, pos_x, pos_y, required_perk_id } = req.body;
  await pool.query(
    `UPDATE perks SET name=$1, description=$2, cost=$3, pos_x=$4, pos_y=$5, required_perk_id=$6
     WHERE id=$7`,
    [name, description, cost, pos_x, pos_y, required_perk_id || null, req.params.id]
  );
  res.json({ success: true });
});

app.delete('/api/admin/perks/:id', async (req, res) => {
  await pool.query('DELETE FROM perks WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
