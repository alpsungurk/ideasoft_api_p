// Vercel Serverless Function - Update imported product
// Vercel'de dinamik route: /api/db/imported-products/:id
import mysql from 'mysql2/promise'

let pool = null

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'ideasoft_api_db',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      connectTimeout: 60000,
      acquireTimeout: 60000,
      timeout: 60000,
      reconnect: true
    })
  }
  return pool
}

export default async function handler(req, res) {
  let connection = null
  try {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      return res.status(200).end()
    }

    if (req.method !== 'PATCH') {
      return res.status(405).json({ success: false, error: 'Method not allowed' })
    }

    const pool = getPool()
    connection = await pool.getConnection()

    // Vercel'de dinamik route parametresi
    // Vercel'de [id].js dosyası için req.query.id kullanılır
    const id = parseInt(req.query.id, 10)
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid product ID' })
    }

    const {
      description,
      imageUrl,
      status,
      name,
      sku,
      price,
      stockAmount,
      categoryId,
      ideasoft_product_id,
      ideasoftProductId
    } = req.body || {}

    const fields = []
    const values = []

    if (description !== undefined) {
      fields.push('description = ?')
      values.push(String(description))
    }

    if (imageUrl !== undefined) {
      fields.push('image_url = ?')
      values.push(String(imageUrl))
    }

    if (status !== undefined) {
      fields.push('status = ?')
      values.push(Number(status) === 1 ? 1 : 0)
    }

    if (name !== undefined) {
      fields.push('name = ?')
      values.push(String(name))
    }

    if (sku !== undefined) {
      fields.push('sku = ?')
      values.push(String(sku))
    }

    if (price !== undefined) {
      fields.push('price = ?')
      values.push(Number(price) || 0)
    }

    if (stockAmount !== undefined) {
      fields.push('stock_amount = ?')
      values.push(Number(stockAmount) || 0)
    }

    if (categoryId !== undefined) {
      fields.push('selected_category_id = ?')
      values.push(categoryId === null || categoryId === '' ? null : Number(categoryId))
    }

    const incomingIdeasoftId = ideasoft_product_id !== undefined ? ideasoft_product_id : ideasoftProductId
    if (incomingIdeasoftId !== undefined) {
      fields.push('ideasoft_product_id = ?')
      values.push(incomingIdeasoftId === null || incomingIdeasoftId === '' ? null : Number(incomingIdeasoftId))
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'Güncellenecek alan yok' })
    }

    values.push(id)
    const query = `UPDATE imported_products SET ${fields.join(', ')} WHERE id = ?`
    const [result] = await connection.query(query, values)
    
    return res.json({ success: true, affected: result.affectedRows })
  } catch (err) {
    console.error('Update Product Error:', err)
    return res.status(500).json({ success: false, error: err.message })
  } finally {
    if (connection) {
      connection.release()
    }
  }
}

