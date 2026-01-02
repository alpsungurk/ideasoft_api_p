// Vercel Serverless Function - Update batch statistics
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

    const { batchId } = req.body
    if (!batchId) {
      return res.status(400).json({ success: false, error: 'batchId gerekli' })
    }

    const pool = getPool()
    connection = await pool.getConnection()

    // Calculate stats
    const [stats] = await connection.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN transfer_status = 'SUCCESS' THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN transfer_status = 'FAILED' THEN 1 ELSE 0 END) as failed
      FROM imported_products WHERE batch_id = ?
    `, [batchId])

    const { total, successful, failed } = stats[0]
    const status = (successful + failed) >= total ? 'COMPLETED' : 'PROCESSING'

    await connection.query(`
      UPDATE import_batches 
      SET total_products = ?, successful_products = ?, failed_products = ?, status = ?
      WHERE id = ?
    `, [total, successful, failed, status, batchId])

    return res.json({ success: true })
  } catch (error) {
    console.error('Update Batch Stats Error:', error)
    return res.status(500).json({ success: false, error: error.message })
  } finally {
    if (connection) {
      connection.release()
    }
  }
}

