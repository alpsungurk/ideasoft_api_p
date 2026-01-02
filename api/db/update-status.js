// Vercel Serverless Function - Update transfer status
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
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      return res.status(200).end()
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' })
    }

    const { sku, ideasoftId, status, error } = req.body

    if (!sku) {
      return res.status(400).json({ success: false, error: 'sku gerekli' })
    }

    const pool = getPool()
    connection = await pool.getConnection()

    const query = `
      UPDATE imported_products 
      SET 
        ideasoft_product_id = ?,
        transfer_status = ?,
        transfer_error = ?,
        last_transfer_date = IF(? = 'SUCCESS', NOW(), last_transfer_date)
      WHERE sku = ?
    `

    const [result] = await connection.query(query, [
      ideasoftId || null,
      status || 'PENDING',
      error || null,
      status || 'PENDING',
      sku
    ])

    return res.json({ success: true, affected: result.affectedRows })
  } catch (error) {
    console.error('Update Status Error:', error)
    return res.status(500).json({ success: false, error: error.message })
  } finally {
    if (connection) {
      connection.release()
    }
  }
}

