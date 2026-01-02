// Vercel Serverless Function - Test database connection
import mysql from 'mysql2/promise'

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ success: false, error: 'Method not allowed' })
    }

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      return res.status(200).end()
    }

    const config = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.PORT || process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'ideasoft_api_db',
      connectTimeout: 10000
    }

    console.log('Testing connection with config:', {
      host: config.host,
      port: config.port,
      user: config.user,
      database: config.database,
      hasPassword: !!config.password
    })

    let connection = null
    try {
      connection = await mysql.createConnection(config)
      await connection.ping()
      
      const [rows] = await connection.query('SELECT 1 as test')
      
      return res.status(200).json({
        success: true,
        message: 'Veritabanı bağlantısı başarılı!',
        config: {
          host: config.host,
          port: config.port,
          user: config.user,
          database: config.database
        },
        test: rows[0]
      })
    } finally {
      if (connection) {
        await connection.end()
      }
    }
  } catch (error) {
    console.error('Connection Test Error:', error)
    
    let errorMessage = 'Veritabanı bağlantı hatası'
    
    if (error.code === 'ER_ACCESS_DENIED_ERROR' || error.message?.includes('Access denied')) {
      errorMessage = 'Erişim reddedildi: Kullanıcı adı/şifre hatalı veya uzaktan bağlantı izni yok. Veritabanı kullanıcısının host ayarını "%" yapın.'
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Bağlantı reddedildi: Veritabanı sunucusuna erişilemiyor. Host ve port ayarlarını kontrol edin.'
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'Bağlantı zaman aşımı: Veritabanı sunucusuna ulaşılamıyor. Firewall ayarlarını kontrol edin.'
    } else {
      errorMessage = error.message || 'Bilinmeyen hata'
    }
    
    return res.status(500).json({
      success: false,
      error: errorMessage,
      code: error.code,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}

