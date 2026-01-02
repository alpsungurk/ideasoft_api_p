// Vercel Serverless Function - Ürün-kategori ilişkisi oluşturmak için proxy
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

  const { shopId, accessToken, productId, categoryId, productData } = req.body

  if (!shopId || !accessToken || !productId || !categoryId) {
    return res.status(400).json({ 
      success: false,
      error: 'Shop ID, Access Token, Product ID ve Category ID gerekli' 
    })
  }

  try {
    const apiUrl = `https://${shopId}.myideasoft.com/admin-api/product_to_categories`
    
    const productCategoryData = {
      product: {
        id: productId,
        name: productData?.name || '',
        fullName: productData?.fullName || productData?.name || '',
        sku: productData?.sku || '',
        stockAmount: productData?.stock || productData?.stockAmount || 0.0,
        price1: productData?.price || productData?.price1 || 0,
        currency: {
          id: 1
        },
        status: productData?.status !== undefined ? productData.status : 0
      },
      category: {
        id: categoryId
      }
    }

    const response = await axios.post(apiUrl, productCategoryData, {
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
    console.error('Product Category API Error:', error)
    const errorMessage = error.response?.data?.message || 
                        error.response?.data?.error || 
                        error.response?.data?.error_description ||
                        error.message ||
                        'Kategori ilişkisi oluşturulamadı'
    
    return res.status(error.response?.status || 500).json({
      success: false,
      error: errorMessage,
      statusCode: error.response?.status
    })
  }
}

