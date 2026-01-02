// Vercel Serverless Function - Ürün oluşturmak için proxy
import axios from 'axios'

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { shopId, accessToken, product } = req.body

  if (!shopId || !accessToken || !product) {
    return res.status(400).json({ 
      success: false,
      error: 'Shop ID, Access Token ve Product gerekli' 
    })
  }

  try {
    // Ideasoft API formatına göre ürün objesi oluştur (kategori bilgisi olmadan)
    const ideasoftProduct = {
      name: product.name || '',
      fullName: product.name || product.fullName || '',
      sku: product.sku || '',
      price1: product.price || product.price1 || 0,
      stockAmount: product.stock || product.stockAmount || 0.0,
      currency: {
        id: 1
      },
      status: product.status !== undefined ? product.status : 0 // 0 = Pasif
    }

    const apiUrl = `https://${shopId}.myideasoft.com/admin-api/products`

    const response = await axios.post(apiUrl, ideasoftProduct, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })

    return res.status(200).json({
      success: true,
      data: response.data
    })
  } catch (error) {
    console.error('Products API Error:', error)
    const errorMessage = error.response?.data?.message || 
                        error.response?.data?.error || 
                        error.response?.data?.error_description ||
                        error.message ||
                        'Ürün oluşturulamadı'
    
    return res.status(error.response?.status || 500).json({
      success: false,
      error: errorMessage,
      statusCode: error.response?.status
    })
  }
}

