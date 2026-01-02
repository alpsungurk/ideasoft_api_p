// Vercel Serverless Function - Create new batch
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
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      return res.status(200).end()
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' })
    }

    // Vercel IP adresini al
    const vercelIp = req.headers['x-forwarded-for'] || 
                     req.headers['x-real-ip'] || 
                     req.connection?.remoteAddress || 
                     req.socket?.remoteAddress ||
                     'unknown'
    
    console.log('🌐 Vercel IP Address:', vercelIp)
    console.log('🌐 Request Headers:', JSON.stringify(req.headers, null, 2))

    const { products, projectName } = req.body

    if (!products || products.length === 0) {
      return res.status(400).json({ success: false, error: 'Ürün listesi boş' })
    }
    if (!projectName) {
      return res.status(400).json({ success: false, error: 'Proje ismi gerekli' })
    }

    // Aynı SKU kontrolü
    const skuCounts = new Map()
    for (const p of products) {
      const sku = String(p?.sku || '').trim()
      if (!sku) continue
      skuCounts.set(sku, (skuCounts.get(sku) || 0) + 1)
    }
    const duplicateSkus = [...skuCounts.entries()].filter(([, c]) => c > 1).map(([sku]) => sku)
    if (duplicateSkus.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Aynı SKU'dan ürünler var: ${duplicateSkus.join(', ')}. Lütfen Excel dosyanızı kontrol edip tekilleştirin.`,
        duplicateSkus
      })
    }

    const pool = getPool()
    connection = await pool.getConnection()

    try {
      await connection.beginTransaction()

      // 1. Batch oluştur
      const [batchResult] = await connection.query(
        'INSERT INTO import_batches (name, total_products, status) VALUES (?, ?, ?)',
        [projectName, products.length, 'PROCESSING']
      )
      const batchId = batchResult.insertId

      // 2. Ürünleri ekle
      const query = `
        INSERT INTO imported_products 
        (batch_id, sku, manufacturer_code, name, price, stock_amount, description, image_url, brand, category_xml_name, selected_category_id, ideasoft_category_name, status, transfer_status) 
        VALUES ?
      `

      const values = products.map(p => [
        batchId,
        String(p.sku || '').trim(),
        String(p.manufacturerCode || p.manufacturer_code || '').trim(),
        String(p.name || '').trim(),
        Number(p.price ?? p.price1 ?? 0) || 0,
        Number(p.stock ?? p.stockAmount ?? p.stock_amount ?? 0) || 0,
        String(p.description || '').trim(),
        String(p.image || p.imageUrl || p.image_url || '').trim(),
        String(p.brand || '').trim(),
        String(p.category || p.category_xml_name || '').trim(),
        (p.categoryId === undefined || p.categoryId === null || p.categoryId === '')
          ? null
          : Number(p.categoryId),
        (p.categoryName === undefined || p.categoryName === null || p.categoryName === '')
          ? null
          : String(p.categoryName),
        0,
        'PENDING'
      ])

      await connection.query(query, [values])
      await connection.commit()

      return res.status(200).json({
        success: true,
        message: 'Proje oluşturuldu',
        batchId: batchId
      })
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  } catch (error) {
    console.error('Batch Create Error:', error)
    
    // Access denied hatası için özel mesaj
    if (error.code === 'ER_ACCESS_DENIED_ERROR' || error.message?.includes('Access denied')) {
      return res.status(500).json({
        success: false,
        error: 'Veritabanı erişim hatası: Kullanıcı adı veya şifre hatalı, ya da veritabanı kullanıcısının uzaktan bağlantı izni yok. Lütfen veritabanı ayarlarınızı kontrol edin.'
      })
    }
    
    const msg = error?.sqlMessage || error?.message || 'Batch create failed'
    return res.status(500).json({
      success: false,
      error: msg,
      code: error?.code,
      errno: error?.errno
    })
  }
}

