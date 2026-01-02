// Vercel Serverless Function - Get batch details by ID
// Vercel'de query parametresi olarak id alınır: /api/db/batches-id?id=123
import mysql from 'mysql2/promise'

let pool = null

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.PORT || process.env.DB_PORT || '3306', 10),
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
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      return res.status(200).end()
    }

    if (req.method !== 'GET') {
      return res.status(405).json({ success: false, error: 'Method not allowed' })
    }

    // Vercel IP adresini al - farklı yöntemler dene
    const vercelIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                     req.headers['x-real-ip'] || 
                     req.headers['x-vercel-forwarded-for'] ||
                     req.headers['cf-connecting-ip'] ||
                     req.connection?.remoteAddress || 
                     req.socket?.remoteAddress ||
                     req.ip ||
                     'unknown'
    
    // Vercel'in kendi environment variable'ları
    const vercelRegion = process.env.VERCEL_REGION || 'unknown'
    const vercelUrl = process.env.VERCEL_URL || 'unknown'
    
    console.log('🌐 Vercel IP Address:', vercelIp)
    console.log('🌐 Vercel Region:', vercelRegion)
    console.log('🌐 Vercel URL:', vercelUrl)
    console.log('🌐 All Request Headers:', JSON.stringify(req.headers, null, 2))
    console.log('🌐 Request Object Keys:', Object.keys(req))
    console.log('🌐 Connection Info:', {
      remoteAddress: req.connection?.remoteAddress,
      socketRemoteAddress: req.socket?.remoteAddress,
      ip: req.ip
    })

    // Vercel'de query parametresi olarak id alınır
    const batchId = parseInt(req.query.id, 10)
    if (isNaN(batchId)) {
      return res.status(400).json({ success: false, error: 'Invalid batch ID' })
    }

    const pool = getPool()
    connection = await pool.getConnection()
    
    // Batch info
    const [batchRows] = await connection.query({
      sql: 'SELECT * FROM import_batches WHERE id = ?',
      timeout: 30000
    }, [batchId])
    
    if (batchRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Proje bulunamadı' })
    }

    // Products
    const [productRows] = await connection.query({
      sql: 'SELECT * FROM imported_products WHERE batch_id = ?',
      timeout: 30000
    }, [batchId])

    return res.status(200).json({
      success: true,
      data: {
        ...batchRows[0],
        products: productRows
      }
    })
  } catch (error) {
    console.error('Get Batch Details Error:', error)
    
    if (error.code === 'ECONNRESET' || error.code === 'PROTOCOL_CONNECTION_LOST' || error.code === 'ETIMEDOUT') {
      return res.status(500).json({ 
        success: false, 
        error: 'Veritabanı bağlantısı kesildi. Lütfen sayfayı yenileyin ve tekrar deneyin.' 
      })
    }
    
    // Access denied hatası için özel mesaj
    if (error.code === 'ER_ACCESS_DENIED_ERROR' || error.message?.includes('Access denied')) {
      return res.status(500).json({ 
        success: false, 
        error: 'Veritabanı erişim hatası: Kullanıcı adı veya şifre hatalı, ya da veritabanı kullanıcısının uzaktan bağlantı izni yok. Lütfen veritabanı ayarlarınızı kontrol edin.' 
      })
    }
    
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Veritabanı hatası oluştu' 
    })
  } finally {
    if (connection) {
      connection.release()
    }
  }
}

