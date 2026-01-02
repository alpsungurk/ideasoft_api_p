// Vercel Serverless Function - Kategorileri çekmek için proxy
import axios from 'axios'

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { shopId, accessToken, categoryId } = req.method === 'GET' ? req.query : req.body

  if (!shopId || !accessToken) {
    return res.status(400).json({ 
      success: false,
      error: 'Shop ID ve Access Token gerekli' 
    })
  }

  try {
    let apiUrl
    if (categoryId) {
      // Tek kategori getir
      apiUrl = `https://${shopId}.myideasoft.com/admin-api/categories/${categoryId}`
    } else {
      // Tüm kategorileri getir
      apiUrl = `https://${shopId}.myideasoft.com/admin-api/categories`
    }

    const response = await axios.get(apiUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })

    // Response data'yı kontrol et
    let categoriesList = []
    if (categoryId) {
      // Tek kategori döndür
      return res.status(200).json({
        success: true,
        data: response.data
      })
    } else {
      // Tüm kategoriler
      if (Array.isArray(response.data)) {
        categoriesList = response.data
      } else if (response.data && Array.isArray(response.data.items)) {
        categoriesList = response.data.items
      } else if (response.data && Array.isArray(response.data.categories)) {
        categoriesList = response.data.categories
      } else if (response.data && response.data.data && Array.isArray(response.data.data)) {
        categoriesList = response.data.data
      }

      // Status 1 olanları filtrele (1 = Aktif)
      const activeCategories = categoriesList.filter(cat => cat.status === 1)

      // Parent name'leri de ekle
      const categoriesWithParent = activeCategories.map(cat => ({
        ...cat,
        parentName: cat.parent?.name || null,
        parentId: cat.parent?.id || null
      }))

      return res.status(200).json({
        success: true,
        data: categoriesWithParent,
        total: categoriesList.length,
        active: activeCategories.length
      })
    }
  } catch (error) {
    console.error('Categories API Error:', error)
    const errorMessage = error.response?.data?.message || 
                        error.response?.data?.error || 
                        error.response?.data?.error_description ||
                        error.message ||
                        'Kategoriler alınamadı'
    
    return res.status(error.response?.status || 500).json({
      success: false,
      error: errorMessage,
      statusCode: error.response?.status
    })
  }
}

