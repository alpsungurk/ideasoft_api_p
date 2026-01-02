import axios from 'axios'
import { normalizeErrorMessage } from '../utils/errorHandler'

// Ideasoft API base URL - OAuth2 token ile kullanılır
const IDEASOFT_API_BASE = 'https://api.ideasoft.com.tr/api/v1'

/**
 * Ürün-kategori ilişkisini oluştur
 * Backend proxy üzerinden çalışır (CORS sorununu çözmek için)
 * @param {number} productId - Ürün ID
 * @param {number} categoryId - Kategori ID
 * @param {string} accessToken - OAuth2 access token
 * @param {string} shopId - Mağaza ID
 * @param {Object} productData - Ürün verisi (product objesi için)
 * @returns {Promise<Object>} İşlem sonucu
 */
export const createProductCategory = async (productId, categoryId, accessToken, shopId, productData) => {
  try {
    // Backend API endpoint kullan (CORS sorununu çözmek için)
    const apiUrl = '/api/product-to-categories'

    const response = await axios.post(
      apiUrl,
      {
        shopId,
        accessToken,
        productId,
        categoryId,
        productData
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    )

    if (response.data && response.data.success) {
      return { success: true, data: response.data.data }
    } else {
      throw new Error(response.data?.error || 'Kategori ilişkisi oluşturulamadı')
    }
  } catch (error) {
    const errorMessage = error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'Kategori ilişkisi oluşturulamadı'
    return {
      success: false,
      error: normalizeErrorMessage(errorMessage),
      statusCode: error.response?.status
    }
  }
}

export const postProductImage = async ({ shopId, accessToken, localProductId, imageUrl, ideasoftProductId }) => {
  try {
    const response = await axios.post(
      '/api/product-images',
      {
        shopId,
        accessToken,
        localProductId,
        imageUrl,
        ideasoftProductId
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    )

    if (response.data && response.data.success) {
      return { 
        success: true, 
        data: response.data.data,
        duplicate: response.data.duplicate || false
      }
    }

    return { success: false, error: normalizeErrorMessage(response.data?.error || 'ProductImages gönderilemedi') }
  } catch (error) {
    const errorMessage = error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'ProductImages gönderilemedi'
    return { success: false, error: normalizeErrorMessage(errorMessage), statusCode: error.response?.status }
  }
}

export const findIdeasoftProductBySku = async ({ shopId, accessToken, sku }) => {
  try {
    const response = await axios.post(
      '/api/ideasoft/find-product-by-sku',
      { shopId, accessToken, sku },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    )

    if (response.data && response.data.success) {
      return { success: true, data: response.data.data }
    }

    return { success: false, error: normalizeErrorMessage(response.data?.error || 'Ürün bulunamadı') }
  } catch (error) {
    const errorMessage = error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'Ürün bulunamadı'
    return { success: false, error: normalizeErrorMessage(errorMessage), statusCode: error.response?.status }
  }
}

/**
 * Ideasoft API'ye ürün oluşturur
 * Önce ürünü oluşturur, sonra kategori varsa kategori ilişkisini ekler
 * @param {Object} product - Ürün bilgileri
 * @param {string} accessToken - OAuth2 access token
 * @param {string} shopId - Mağaza ID
 * @returns {Promise<Object>} İşlem sonucu
 */
export const createIdeasoftProduct = async (product, accessToken, shopId) => {
  try {
    // Ideasoft API formatına göre ürün objesi oluştur
    // Sadece gerekli alanlar gönderilecek (kategori bilgisi olmadan)
    const ideasoftProduct = {
      name: product.name || '',
      fullName: product.name || product.fullName || '',
      sku: product.sku || '',
      price1: product.price || product.price1 || 0,
      stockAmount: product.stock || product.stockAmount || 0.0,
      currency: {
        id: 1
      },
      status: 0 // 0 = Pasif
    }

    // 1. Önce ürünü oluştur (kategori bilgisi olmadan)
    // Backend API endpoint kullan (CORS sorununu çözmek için)
    const apiUrl = '/api/products'

    const response = await axios.post(
      apiUrl,
      {
        shopId,
        accessToken,
        product: ideasoftProduct
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    )

    if (!response.data || !response.data.success) {
      throw new Error(response.data?.error || 'Ürün oluşturulamadı')
    }

    const createdProduct = response.data.data
    const productId = createdProduct.id

    // 2. Eğer kategori varsa, kategori ilişkisini oluştur
    if (product.categoryId && productId) {
      const categoryResult = await createProductCategory(
        productId,
        product.categoryId,
        accessToken,
        shopId,
        {
          ...product,
          ...createdProduct
        }
      )

      if (!categoryResult.success) {
        // Ürün oluşturuldu ama kategori eklenemedi - yine de başarılı sayılabilir
        return {
          success: true,
          data: createdProduct,
          warning: `Kategori ilişkisi eklenemedi: ${categoryResult.error}`
        }
      }

      return {
        success: true,
        data: createdProduct,
        categoryRelation: categoryResult.data
      }
    }

    return { success: true, data: createdProduct }
  } catch (error) {
    const errorMessage = error.response?.data?.message ||
      error.response?.data?.error ||
      error.response?.data?.error_description ||
      error.message ||
      'Bilinmeyen bir hata oluştu'
    return {
      success: false,
      error: normalizeErrorMessage(errorMessage),
      statusCode: error.response?.status
    }
  }
}

/**
 * Toplu ürün oluşturma
 * @param {Array} products - Ürün listesi
 * @param {string} accessToken - OAuth2 access token
 * @param {string} shopId - Mağaza ID
 * @param {Function} onProgress - İlerleme callback fonksiyonu
 * @returns {Promise<Array>} İşlem sonuçları
 */
export const bulkCreateProducts = async (products, accessToken, shopId, onProgress) => {
  const results = []
  const total = products.length

  for (let i = 0; i < products.length; i++) {
    const product = products[i]
    const result = await createIdeasoftProduct(product, accessToken, shopId)
    results.push({ ...result, product: product.name, index: i + 1 })

    if (onProgress) {
      onProgress({
        current: i + 1,
        total,
        product: product.name,
        success: result.success,
        error: result.error,
        data: result.data
      })
    }

    // API rate limit için kısa bekleme (Ideasoft API limitlerine göre ayarlayın)
    if (i < products.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  return results
}

export const postProductDetail = async ({ shopId, accessToken, localProductId, details, extraDetails }) => {
  try {
    // Parametre validasyonu
    if (!localProductId) {
      return { success: false, error: normalizeErrorMessage('localProductId gerekli') }
    }
    if (!shopId || !accessToken) {
      return { success: false, error: normalizeErrorMessage('shopId ve accessToken gerekli') }
    }

    const response = await axios.post(
      '/api/product-details',
      {
        shopId,
        accessToken,
        localProductId: Number(localProductId), // Number'a çevir
        details: String(details || '').trim(),
        extraDetails: String(extraDetails || '').trim()
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    )

    if (response.data && response.data.success) {
      return { 
        success: true, 
        data: response.data.data,
        duplicate: response.data.duplicate || false
      }
    }

    return { success: false, error: normalizeErrorMessage(response.data?.error || 'ProductDetail gönderilemedi') }
  } catch (error) {
    const errorMessage = error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'ProductDetail gönderilemedi'
    return { success: false, error: normalizeErrorMessage(errorMessage), statusCode: error.response?.status }
  }
}

export const getIdeasoftProductsBatch = async ({ shopId, accessToken, productIds }) => {
  try {
    const response = await axios.post(
      '/api/ideasoft/get-products-batch',
      { shopId, accessToken, productIds },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    )

    if (response.data && response.data.success) {
      return { success: true, data: response.data.data }
    }

    return { success: false, error: normalizeErrorMessage(response.data?.error || 'Toplu ürün çekilemedi') }
  } catch (error) {
    const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message || 'Toplu ürün çekilemedi'
    return { success: false, error: normalizeErrorMessage(errorMessage), statusCode: error.response?.status }
  }
}



export const updateIdeasoftProduct = async ({ shopId, accessToken, productId, productData }) => {
  try {
    const { categoryId, ...rest } = productData || {}
    const response = await axios.put(
      `/api/ideasoft/products/${productId}`,
      { shopId, accessToken, productData: rest },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    )

    if (response.data && response.data.success) {
      const updated = response.data.data
      if (categoryId) {
        const catRes = await createProductCategory(
          Number(productId),
          Number(categoryId),
          accessToken,
          shopId,
          { ...rest, ...updated }
        )
        if (!catRes?.success) {
          return { success: true, data: updated, warning: catRes?.error || 'Kategori ilişkisi güncellenemedi' }
        }
      }
      return { success: true, data: updated }
    }

    return { success: false, error: normalizeErrorMessage(response.data?.error || 'Ürün güncellenemedi') }
  } catch (error) {
    const errorMessage = error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'Ürün güncellenemedi'
    return { success: false, error: normalizeErrorMessage(errorMessage), statusCode: error.response?.status }
  }
}


export const getIdeasoftProduct = async ({ shopId, accessToken, productId }) => {
  try {
    const response = await axios.post(
      '/api/ideasoft/get-product',
      { shopId, accessToken, productId },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    )

    if (response.data && response.data.success) {
      return { success: true, data: response.data.data }
    }

    return { success: false, error: normalizeErrorMessage(response.data?.error || 'Ürün alınamadı') }
  } catch (error) {
    const errorMessage = error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'Ürün alınamadı'
    return { success: false, error: normalizeErrorMessage(errorMessage), statusCode: error.response?.status }
  }
}

/**
 * OAuth2 token almak için (isteğe bağlı - kullanıcı token'ı manuel girebilir)
 * @param {string} clientId - Client ID
 * @param {string} clientSecret - Client Secret
 * @returns {Promise<string>} Access token
 */
export const getAccessToken = async (clientId, clientSecret) => {
  try {
    // Ideasoft API'ye doğrudan istek at
    const response = await axios.post(
      'https://api.ideasoft.com.tr/oauth/token',
      {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    )

    if (response.data && response.data.access_token) {
      return response.data.access_token
    } else {
      throw new Error('Token alınamadı: Geçersiz yanıt')
    }
  } catch (error) {
    const errorMessage = error.response?.data?.error_description ||
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'Token alınamadı'
    throw new Error(errorMessage)
  }
}

/**
 * OAuth 2.0 authorization sayfasına yönlendir
 * @param {string} shopId - Shop ID (örn: ilkteknomarket)
 * @param {string} clientId - Client ID
 * @param {string} redirectUri - Redirect URI
 * @returns {void}
 */
export const initiateOAuth2Flow = (shopId, clientId, redirectUri) => {
  // State değeri güvenlik için random oluştur
  const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  localStorage.setItem('oauth2_state', state)
  localStorage.setItem('oauth2_shopId', shopId)
  localStorage.setItem('oauth2_clientId', clientId)
  localStorage.setItem('oauth2_redirectUri', redirectUri)

  // Authorization URL oluştur
  const authUrl = `https://${shopId}.myideasoft.com/panel/auth?` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `response_type=code&` +
    `state=${encodeURIComponent(state)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}`

  // Yönlendir
  window.location.href = authUrl
}

/**
 * Authorization code ile token al (Backend proxy üzerinden - CORS sorunu için)
 * @param {string} code - Authorization code
 * @param {string} shopId - Shop ID
 * @param {string} clientId - Client ID
 * @param {string} clientSecret - Client Secret
 * @param {string} redirectUri - Redirect URI
 * @returns {Promise<Object>} Token bilgileri
 */
export const exchangeCodeForToken = async (code, shopId, clientId, clientSecret, redirectUri) => {
  try {
    // Backend API endpoint kullan (CORS sorununu çözmek için)
    // Vite proxy ile development server'a yönlendirilir
    const apiUrl = '/api/exchange-token'

    const response = await axios.post(
      apiUrl,
      {
        code,
        shopId,
        clientId,
        clientSecret,
        redirectUri
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 15000
      }
    )

    if (response.data && response.data.success && response.data.access_token) {
      // Token'ı localStorage'a kaydet
      const tokenData = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in,
        token_type: response.data.token_type,
        expires_at: Date.now() + (response.data.expires_in * 1000),
        shopId: shopId
      }
      localStorage.setItem('ideasoft_token', JSON.stringify(tokenData))

      return tokenData
    } else {
      const errorMsg = response.data?.error || 'Token alınamadı: Geçersiz yanıt'
      throw new Error(String(errorMsg))
    }
  } catch (error) {
    let errorMessage = 'Token alınamadı'
    
    if (error.response) {
      errorMessage = error.response.data?.error ||
        error.response.data?.error_description ||
        error.response.data?.message ||
      error.message ||
      'Token alınamadı'
    } else if (error.request) {
      errorMessage = 'Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin.'
    } else {
      errorMessage = error.message || 'Bilinmeyen hata oluştu'
    }
    
    throw new Error(String(errorMessage))
  }
}

/**
 * Refresh token ile yeni access token al
 * @param {string} shopId - Shop ID
 * @param {string} clientId - Client ID
 * @param {string} clientSecret - Client Secret
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<Object>} Yeni token bilgileri
 */
export const refreshAccessToken = async (shopId, clientId, clientSecret, refreshToken) => {
  try {
    const response = await axios.post(
      `https://${shopId}.myideasoft.com/oauth/v2/token`,
      {
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    )

    if (response.data && response.data.access_token) {
      const tokenData = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in,
        token_type: response.data.token_type,
        expires_at: Date.now() + (response.data.expires_in * 1000),
        shopId: shopId
      }
      localStorage.setItem('ideasoft_token', JSON.stringify(tokenData))
      return tokenData
    } else {
      throw new Error('Token yenilenemedi: Geçersiz yanıt')
    }
  } catch (error) {
    const errorMessage = error.response?.data?.error_description ||
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'Token yenilenemedi'
    throw new Error(errorMessage)
  }
}

/**
 * Kayıtlı token'ı al (varsa)
 * @returns {Object|null} Token bilgileri veya null
 */
export const getStoredToken = () => {
  try {
    const tokenData = localStorage.getItem('ideasoft_token')
    if (!tokenData) return null

    const token = JSON.parse(tokenData)

    // Token süresi dolmuş mu kontrol et
    if (token.expires_at && Date.now() >= token.expires_at) {
      return null // Süresi dolmuş
    }

    return token
  } catch (error) {
    return null
  }
}

/**
 * Tüm kategorileri listele (sadece aktif olanlar - status: 1)
 * Backend proxy üzerinden çalışır (CORS sorununu çözmek için)
 * @param {string} accessToken - OAuth2 access token
 * @param {string} shopId - Mağaza ID
 * @returns {Promise<Object>} Kategori listesi
 */
export const getCategories = async (accessToken, shopId) => {
  try {
    // Backend API endpoint kullan (CORS sorununu çözmek için)
    const apiUrl = '/api/categories'

    const response = await axios.get(apiUrl, {
      params: {
        shopId,
        accessToken
      },
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })

    if (response.data && response.data.success) {
      const categoriesList = response.data.data || []


      return {
        success: true,
        data: categoriesList,
        total: response.data.total || categoriesList.length,
        active: response.data.active || categoriesList.length
      }
    } else {
      throw new Error(response.data?.error || 'Kategoriler alınamadı')
    }
  } catch (error) {
    const errorMessage = error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'Kategoriler alınamadı'
    return {
      success: false,
      error: errorMessage,
      statusCode: error.response?.status,
      data: []
    }
  }
}

/**
 * Belirli bir kategoriyi getir
 * Backend proxy üzerinden çalışır (CORS sorununu çözmek için)
 * @param {string} accessToken - OAuth2 access token
 * @param {string} shopId - Mağaza ID
 * @param {number|string} categoryId - Kategori ID
 * @returns {Promise<Object>} Kategori bilgileri
 */
export const recreateDeletedProduct = async (product, accessToken, shopId) => {
  try {
    const response = await axios.post(
      '/api/recreate-deleted-product',
      {
        shopId,
        accessToken,
        product
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    )

    if (response.data && response.data.success) {
      return { success: true, data: response.data.data }
    }

    return { success: false, error: normalizeErrorMessage(response.data?.error || 'Silinmiş ürün yeniden oluşturulamadı') }
  } catch (error) {
    const errorMessage = error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'Silinmiş ürün yeniden oluşturulamadı'
    return { success: false, error: normalizeErrorMessage(errorMessage), statusCode: error.response?.status }
  }
}

export const getCategory = async (accessToken, shopId, categoryId) => {
  try {
    // Backend API endpoint kullan (CORS sorununu çözmek için)
    const apiUrl = '/api/categories'

    const response = await axios.get(apiUrl, {
      params: {
        shopId,
        accessToken,
        categoryId
      },
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })

    if (response.data && response.data.success) {
      const category = response.data.data
      return { success: true, data: category }
    } else {
      throw new Error(response.data?.error || 'Kategori alınamadı')
    }
  } catch (error) {
    console.error('Category API Error:', error)
    const errorMessage = error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'Kategori alınamadı'
    return {
      success: false,
      error: errorMessage,
      statusCode: error.response?.status
    }
  }
}

