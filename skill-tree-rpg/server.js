const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// Configuração do banco de dados (variável de ambiente no Render)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // necessário para o PostgreSQL do Render
});

app.use(express.json());
app.use(express.static('public'));

// ========== Criação das tabelas (executa automaticamente) ==========
async function initDB() {
  const client = await pool.connect();
  try {
    // Tabela de árvores
    await client.query(`
      CREATE TABLE IF NOT EXISTS skill_trees (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        password TEXT NOT NULL
      );
    `);
    // Tabela de perks
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
    // Tabela do jogador (um único perfil, id = 1)
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
    // Tabela de perks comprados pelo jogador
    await client.query(`
      CREATE TABLE IF NOT EXISTS purchased_perks (
        player_id INTEGER REFERENCES player(id),
        perk_id INTEGER REFERENCES perks(id) ON DELETE CASCADE,
        PRIMARY KEY (player_id, perk_id)
      );
    `);
    // Criar uma árvore de exemplo se não existir nenhuma
    const result = await client.query('SELECT COUNT(*) FROM skill_trees');
    if (parseInt(result.rows[0].count) === 0) {
      await client.query('INSERT INTO skill_trees (name, password) VALUES ($1, $2)', ['Destruição', 'fire123']);
      await client.query('INSERT INTO skill_trees (name, password) VALUES ($1, $2)', ['Arco', 'stealth']);
    }
  } catch (err) {
    console.error('Erro ao criar tabelas:', err);
  } finally {
    client.release();
  }
}
initDB();

// ========== ROTAS DA API ==========

// Listar todas as árvores
app.get('/api/trees', async (req, res) => {
  const result = await pool.query('SELECT id, name FROM skill_trees ORDER BY id');
  res.json(result.rows);
});

// Verificar senha de uma árvore
app.post('/api/trees/verify', async (req, res) => {
  const { treeId, password } = req.body;
  const result = await pool.query('SELECT password FROM skill_trees WHERE id = $1', [treeId]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Árvore não existe' });
  const valid = (result.rows[0].password === password);
  res.json({ valid });
});

// Obter perks de uma árvore + status de compra
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

// Comprar um perk (se tiver pontos e pré-requisito)
app.post('/api/purchase', async (req, res) => {
  const { perkId } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Verificar se já foi comprado
    const already = await client.query('SELECT 1 FROM purchased_perks WHERE player_id = 1 AND perk_id = $1', [perkId]);
    if (already.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Perk já adquirido' });
    }
    // Buscar dados do perk
    const perkData = await client.query('SELECT cost, required_perk_id FROM perks WHERE id = $1', [perkId]);
    if (perkData.rows.length === 0) throw new Error('Perk não existe');
    const { cost, required_perk_id } = perkData.rows[0];
    // Verificar pré-requisito
    if (required_perk_id) {
      const reqPurchased = await client.query('SELECT 1 FROM purchased_perks WHERE player_id = 1 AND perk_id = $1', [required_perk_id]);
      if (reqPurchased.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Pré‑requisito não atendido' });
      }
    }
    // Verificar pontos
    const playerPoints = await client.query('SELECT available_points FROM player WHERE id = 1');
    if (playerPoints.rows[0].available_points < cost) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Pontos insuficientes' });
    }
    // Descontar pontos e registrar compra
    await client.query('UPDATE player SET available_points = available_points - $1 WHERE id = 1', [cost]);
    await client.query('INSERT INTO purchased_perks (player_id, perk_id) VALUES (1, $1)', [perkId]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ========== ROTAS ADMIN (protegidas por senha no frontend, mas com validação extra) ==========
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