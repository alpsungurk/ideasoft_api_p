// Development server - API proxy için
import express from 'express'
import cors from 'cors'
import axios from 'axios'

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json())

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Development server is running' })
})

// OAuth2 token exchange endpoint
app.post('/api/exchange-token', async (req, res) => {
  try {
    const { code, shopId, clientId, clientSecret, redirectUri } = req.body

    if (!code || !shopId || !clientId || !clientSecret || !redirectUri) {
      return res.status(400).json({ 
        error: 'Code, Shop ID, Client ID, Client Secret ve Redirect URI gerekli' 
      })
    }

    const response = await axios.post(
      `https://${shopId}.myideasoft.com/oauth/v2/token`,
      {
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirectUri
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    )

    return res.status(200).json({
      success: true,
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expires_in: response.data.expires_in,
      token_type: response.data.token_type,
      scope: response.data.scope
    })
  } catch (error) {
    console.error('❌ Token alma hatası:', error.message)
    if (error.response) {
      console.error('Error details:', {
        status: error.response.status,
        data: error.response.data
      })
    }
    
    let errorMessage = error.response?.data?.error_description || 
                      error.response?.data?.error || 
                      error.response?.data?.message ||
                      error.message ||
                      'Token alınamadı'
    
    // Daha açıklayıcı hata mesajları
    if (error.response?.data?.error === 'invalid_grant') {
      if (error.response?.data?.error_description?.includes("Code doesn't exist")) {
        errorMessage = 'Authorization code geçersiz veya süresi dolmuş. Lütfen tekrar giriş yapın.'
      } else {
        errorMessage = 'Authorization code hatası: ' + (error.response?.data?.error_description || 'Geçersiz kod')
      }
    } else if (error.response?.data?.error === 'invalid_client') {
      errorMessage = 'Client ID veya Client Secret hatalı. Lütfen kontrol edin.'
    } else if (error.response?.data?.error === 'redirect_uri_mismatch') {
      errorMessage = 'Redirect URI eşleşmiyor. Ideasoft panelinde kayıtlı Redirect URI ile eşleştiğinden emin olun.'
    }
    
    return res.status(error.response?.status || 500).json({
      success: false,
      error: errorMessage,
      errorCode: error.response?.data?.error,
      errorDetails: error.response?.data
    })
  }
})

// Categories endpoint
app.get('/api/categories', async (req, res) => {
  try {
    const { shopId, accessToken, categoryId } = req.query

    if (!shopId || !accessToken) {
      return res.status(400).json({ 
        success: false,
        error: 'Shop ID ve Access Token gerekli' 
      })
    }

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
})

// Products endpoint - Ürün oluşturma
app.post('/api/products', async (req, res) => {
  try {
    const { shopId, accessToken, product } = req.body

    if (!shopId || !accessToken || !product) {
      return res.status(400).json({ 
        success: false,
        error: 'Shop ID, Access Token ve Product gerekli' 
      })
    }

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
})

// Product-to-Categories endpoint - Ürün-kategori ilişkisi oluşturma
app.post('/api/product-to-categories', async (req, res) => {
  try {
    const { shopId, accessToken, productId, categoryId, productData } = req.body

    if (!shopId || !accessToken || !productId || !categoryId) {
      return res.status(400).json({ 
        success: false,
        error: 'Shop ID, Access Token, Product ID ve Category ID gerekli' 
      })
    }

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
})

app.listen(PORT, () => {
  console.log(`🚀 Development API server running on http://localhost:${PORT}`)
})

