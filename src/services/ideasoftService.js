import { normalizeErrorMessage, isDuplicateError } from '../utils/errorHandler'

// Ideasoft API base URL - OAuth2 token ile kullanılır
const IDEASOFT_API_BASE = 'https://api.ideasoft.com.tr/api/v1'

// Supabase Edge Functions URL'i veya local proxy
const getIdeasoftApiBase = () => {
  // Supabase Edge Functions kullan (hem local hem production)
  if (import.meta.env.VITE_SUPABASE_URL) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL.replace(/\/$/, '')
    return `${supabaseUrl}/functions/v1`
  }
  
  // Production'da VITE_SUPABASE_URL zorunlu
  if (import.meta.env.MODE === 'production' || import.meta.env.PROD) {
    console.error('❌ VITE_SUPABASE_URL environment variable is missing in production!')
    throw new Error('Supabase configuration missing. Please set VITE_SUPABASE_URL in Vercel environment variables.')
  }
  
  // Fallback: Local development'da server.js proxy kullan
  return '/api'
}

// Edge Function isimleri
const IDEASOFT_EDGE_FUNCTIONS = {
  EXCHANGE_TOKEN: 'ideasoft-exchange-token',
  CATEGORIES: 'ideasoft-categories',
  PRODUCTS: 'ideasoft-products',
  PRODUCT_TO_CATEGORIES: 'ideasoft-product-to-categories',
  PRODUCT_DETAILS: 'ideasoft-product-details',
  PRODUCT_IMAGES: 'ideasoft-product-images',
  SCRAPE: 'scrape',
  GEMINI_GENERATE: 'gemini-generate-description',
  GEMINI_VALIDATE: 'gemini-validate-key'
}

// Authorization header (anon key)
const getAuthHeaders = () => {
  const headers = { 'Content-Type': 'application/json' }
  
  // Supabase anon key kullan (hem local hem production)
  if (import.meta.env.VITE_SUPABASE_ANON_KEY) {
    headers['Authorization'] = `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
    headers['apikey'] = import.meta.env.VITE_SUPABASE_ANON_KEY
  }
  
  return headers
}

/**
 * Ürün-kategori ilişkisini oluştur veya güncelle
 * Backend proxy üzerinden çalışır (CORS sorununu çözmek için)
 * @param {number} productId - Ürün ID
 * @param {number} categoryId - Kategori ID
 * @param {string} accessToken - OAuth2 access token
 * @param {string} shopId - Mağaza ID
 * @param {Object} productData - Ürün verisi (product objesi için)
 * @param {number} oldCategoryId - Eski kategori ID (güncelleme için, PUT kullanılır)
 * @returns {Promise<Object>} İşlem sonucu
 */
export const createProductCategory = async (productId, categoryId, accessToken, shopId, productData, oldCategoryId = null) => {
  try {
    const apiBase = getIdeasoftApiBase()
    const apiUrl = `${apiBase}/${IDEASOFT_EDGE_FUNCTIONS.PRODUCT_TO_CATEGORIES}`

    // oldCategoryId varsa PUT kullan (kategori güncellemesi), yoksa POST (yeni kategori ekleme)
    const method = oldCategoryId !== null && oldCategoryId !== undefined ? 'PUT' : 'POST'

    const response = await fetch(apiUrl, {
      method: method,
      headers: getAuthHeaders(),
      body: JSON.stringify({
        shopId,
        accessToken,
        productId,
        categoryId,
        productData,
        oldCategoryId: oldCategoryId !== null && oldCategoryId !== undefined ? oldCategoryId : null
      })
    })

    const data = await response.json().catch(() => ({}))

    if (data && data.success) {
      return { success: true, data: data.data }
    } else {
      // Duplicate hatası ise başarılı say (kategori ilişkisi zaten var)
      const errorMsg = data?.error || 'Kategori ilişkisi oluşturulamadı'
      if (isDuplicateError(errorMsg) || data?.duplicate) {
        return { success: true, data: null, duplicate: true }
      }
      throw new Error(errorMsg)
    }
  } catch (error) {
    const errorMessage = error.message || 'Kategori ilişkisi oluşturulamadı'
    // Duplicate hatası ise başarılı say
    if (isDuplicateError(errorMessage)) {
      return { success: true, data: null, duplicate: true }
    }
    return {
      success: false,
      error: normalizeErrorMessage(errorMessage),
      statusCode: error.status
    }
  }
}

export const postProductImage = async ({ shopId, accessToken, localProductId, imageUrl, ideasoftProductId, productImageId = null }) => {
  try {
    // Image URL'ini düzelt: // ile başlıyorsa https:// ekle
    let normalizedImageUrl = String(imageUrl || '').trim()
    if (normalizedImageUrl && normalizedImageUrl.startsWith('//')) {
      normalizedImageUrl = 'https:' + normalizedImageUrl
    }
    
    // Eğer URL hala geçersizse, hata döndür
    if (normalizedImageUrl && !normalizedImageUrl.match(/^https?:\/\//i)) {
      return { success: false, error: normalizeErrorMessage(`Geçersiz image URL: ${imageUrl}`) }
    }
    
    const apiBase = getIdeasoftApiBase()
    const apiUrl = `${apiBase}/${IDEASOFT_EDGE_FUNCTIONS.PRODUCT_IMAGES}`
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        shopId,
        accessToken,
        localProductId,
        imageUrl: normalizedImageUrl,
        ideasoftProductId,
        productImageId: productImageId !== null && productImageId !== undefined ? Number(productImageId) : null // PUT için ID gönder
      })
    })

    const data = await response.json().catch(() => ({}))

    if (data && data.success) {
      return { 
        success: true, 
        data: data.data,
        duplicate: data.duplicate || false
      }
    }

    return { success: false, error: normalizeErrorMessage(data?.error || 'ProductImages gönderilemedi') }
  } catch (error) {
    const errorMessage = error.message || 'ProductImages gönderilemedi'
    return { success: false, error: normalizeErrorMessage(errorMessage), statusCode: error.status }
  }
}

export const findIdeasoftProductBySku = async ({ shopId, accessToken, sku }) => {
  try {
    const apiBase = getIdeasoftApiBase()
    // Supabase Edge Function kullan
    const apiUrl = `${apiBase}/ideasoft-product-details`
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ shopId, accessToken, sku })
    })

    const data = await response.json().catch(() => ({}))

    if (data && data.success) {
      return { success: true, data: data.data }
    }

    return { success: false, error: normalizeErrorMessage(data?.error || 'Ürün bulunamadı') }
  } catch (error) {
    const errorMessage = error.message || 'Ürün bulunamadı'
    return { success: false, error: normalizeErrorMessage(errorMessage), statusCode: error.status }
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
    const apiBase = getIdeasoftApiBase()
    const apiUrl = `${apiBase}/${IDEASOFT_EDGE_FUNCTIONS.PRODUCTS}`

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        shopId,
        accessToken,
        product: ideasoftProduct
      })
    })

    const responseData = await response.json().catch(() => ({}))

    if (!responseData || !responseData.success) {
      throw new Error(responseData?.error || 'Ürün oluşturulamadı')
    }

    const createdProduct = responseData.data
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
    const errorMessage = error.message || 'Bilinmeyen bir hata oluştu'
    return {
      success: false,
      error: normalizeErrorMessage(errorMessage),
      statusCode: error.status
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

export const postProductDetail = async ({ shopId, accessToken, localProductId, details, extraDetails, productDetailId = null }) => {
  try {
    // Parametre validasyonu
    if (!localProductId) {
      return { success: false, error: normalizeErrorMessage('localProductId gerekli') }
    }
    
    // localProductId'yi number'a çevir ve kontrol et
    const productId = Number(localProductId)
    if (isNaN(productId) || productId <= 0) {
      return { success: false, error: normalizeErrorMessage(`Geçersiz localProductId: ${localProductId}`) }
    }
    
    if (!shopId || !accessToken) {
      return { success: false, error: normalizeErrorMessage('shopId ve accessToken gerekli') }
    }

    const apiBase = getIdeasoftApiBase()
    const apiUrl = `${apiBase}/${IDEASOFT_EDGE_FUNCTIONS.PRODUCT_DETAILS}`
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        shopId,
        accessToken,
        localProductId: productId,
        details: String(details || '').trim(),
        extraDetails: String(extraDetails || '').trim(),
        productDetailId: productDetailId !== null && productDetailId !== undefined ? Number(productDetailId) : null // PUT için ID gönder
      })
    })

    const data = await response.json().catch(() => ({}))

    if (data && data.success) {
      return { 
        success: true, 
        data: data.data,
        duplicate: data.duplicate || false
      }
    }

    return { success: false, error: normalizeErrorMessage(data?.error || 'ProductDetail gönderilemedi') }
  } catch (error) {
    const errorMessage = error.message || 'ProductDetail gönderilemedi'
    return { success: false, error: normalizeErrorMessage(errorMessage), statusCode: error.status }
  }
}

export const getIdeasoftProductsBatch = async ({ shopId, accessToken, productIds }) => {
  try {
    const apiBase = getIdeasoftApiBase()
    // Supabase Edge Function kullan
    const apiUrl = `${apiBase}/ideasoft-get-products-batch`
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ shopId, accessToken, productIds })
    })

    const data = await response.json().catch(() => ({}))

    if (data && data.success) {
      return { success: true, data: data.data }
    }

    return { success: false, error: normalizeErrorMessage(data?.error || 'Toplu ürün çekilemedi') }
  } catch (error) {
    const errorMessage = error.message || 'Toplu ürün çekilemedi'
    return { success: false, error: normalizeErrorMessage(errorMessage), statusCode: error.status }
  }
}

export const updateIdeasoftProduct = async ({ shopId, accessToken, productId, productData, oldRemoteData = null }) => {
  try {
    const { categoryId, ...rest } = productData || {}
    const apiBase = getIdeasoftApiBase()
    // Supabase Edge Function kullan
    const apiUrl = `${apiBase}/ideasoft-update-product`
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ shopId, accessToken, productId, productData: rest })
    })

    // Response status kontrolü
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData?.error || `HTTP ${response.status}: ${response.statusText}`
      return { 
        success: false, 
        error: normalizeErrorMessage(errorMessage), 
        statusCode: response.status,
        code: response.status
      }
    }

    const data = await response.json().catch(() => ({}))

    if (data && data.success) {
      const updated = data.data
      if (categoryId !== undefined && categoryId !== null) {
        // Eski kategori ID'sini bul (_remote verisinden veya güncellenmiş veriden)
        let oldCategoryId = null
        
        // Önce _remote verisinden al (güncelleme öncesi kategori)
        if (oldRemoteData?.categories && Array.isArray(oldRemoteData.categories) && oldRemoteData.categories.length > 0) {
          oldCategoryId = Number(oldRemoteData.categories[0].id)
        }
        
        // Eğer _remote'da yoksa, güncellenmiş veriden al
        if (!oldCategoryId && updated.categories && Array.isArray(updated.categories) && updated.categories.length > 0) {
          oldCategoryId = Number(updated.categories[0].id)
        }
        
        // Kategori değiştiyse PUT kullan (DELETE + POST), yoksa POST
        // Eğer eski kategori varsa ve yeni kategori farklıysa PUT kullan
        const usePut = oldCategoryId !== null && oldCategoryId !== Number(categoryId)
        
        // PUT kullanılacaksa oldCategoryId gönder (kategori ID'si olarak)
        // Edge function bunu kullanarak mevcut kategori ilişkilerini silecek
        const catRes = await createProductCategory(
          Number(productId),
          Number(categoryId),
          accessToken,
          shopId,
          { ...rest, ...updated },
          usePut ? oldCategoryId : null
        )
        // Duplicate hatası ise başarılı say (kategori ilişkisi zaten var)
        if (!catRes?.success && !catRes?.duplicate && !isDuplicateError(catRes?.error)) {
          return { success: true, data: updated, warning: catRes?.error || 'Kategori ilişkisi güncellenemedi' }
        }
      }
      return { success: true, data: updated }
    }

    return { 
      success: false, 
      error: normalizeErrorMessage(data?.error || 'Ürün güncellenemedi'),
      statusCode: data?.statusCode,
      code: data?.statusCode
    }
  } catch (error) {
    const errorMessage = error.message || 'Ürün güncellenemedi'
    return { 
      success: false, 
      error: normalizeErrorMessage(errorMessage), 
      statusCode: error.status,
      code: error.status
    }
  }
}

export const getIdeasoftProduct = async ({ shopId, accessToken, productId }) => {
  try {
    const apiBase = getIdeasoftApiBase()
    // Supabase Edge Function kullan
    const apiUrl = `${apiBase}/ideasoft-get-product`
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ shopId, accessToken, productId })
    })

    const data = await response.json().catch(() => ({}))

    if (data && data.success) {
      return { success: true, data: data.data }
    }

    return { success: false, error: normalizeErrorMessage(data?.error || 'Ürün alınamadı') }
  } catch (error) {
    const errorMessage = error.message || 'Ürün alınamadı'
    return { success: false, error: normalizeErrorMessage(errorMessage), statusCode: error.status }
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
    const response = await fetch('https://api.ideasoft.com.tr/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret
      })
    })

    const data = await response.json().catch(() => ({}))

    if (data && data.access_token) {
      return data.access_token
    } else {
      throw new Error('Token alınamadı: Geçersiz yanıt')
    }
  } catch (error) {
    const errorMessage = error.message || 'Token alınamadı'
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
    const apiBase = getIdeasoftApiBase()
    const apiUrl = `${apiBase}/${IDEASOFT_EDGE_FUNCTIONS.EXCHANGE_TOKEN}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        code,
        shopId,
        clientId,
        clientSecret,
        redirectUri
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    const data = await response.json().catch(() => ({}))

    if (data && data.success && data.access_token) {
      // Token'ı localStorage'a kaydet
      const tokenData = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        token_type: data.token_type,
        expires_at: Date.now() + (data.expires_in * 1000),
        shopId: shopId
      }
      localStorage.setItem('ideasoft_token', JSON.stringify(tokenData))

      return tokenData
    } else {
      const errorMsg = data?.error || 'Token alınamadı: Geçersiz yanıt'
      throw new Error(String(errorMsg))
    }
  } catch (error) {
    let errorMessage = 'Token alınamadı'
    
    if (error.name === 'AbortError') {
      errorMessage = 'İstek zaman aşımına uğradı. Lütfen tekrar deneyin.'
    } else if (!error.message || error.message === 'Token alınamadı') {
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
    const response = await fetch(`https://${shopId}.myideasoft.com/oauth/v2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken
      })
    })

    const data = await response.json().catch(() => ({}))

    if (data && data.access_token) {
      const tokenData = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        token_type: data.token_type,
        expires_at: Date.now() + (data.expires_in * 1000),
        shopId: shopId
      }
      localStorage.setItem('ideasoft_token', JSON.stringify(tokenData))
      return tokenData
    } else {
      throw new Error('Token yenilenemedi: Geçersiz yanıt')
    }
  } catch (error) {
    const errorMessage = error.message || 'Token yenilenemedi'
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
    const apiBase = getIdeasoftApiBase()
    const apiUrl = `${apiBase}/${IDEASOFT_EDGE_FUNCTIONS.CATEGORIES}?shopId=${encodeURIComponent(shopId)}&accessToken=${encodeURIComponent(accessToken)}`

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: getAuthHeaders()
    })

    const data = await response.json().catch(() => ({}))

    if (data && data.success) {
      const categoriesList = data.data || []

      return {
        success: true,
        data: categoriesList,
        total: data.total || categoriesList.length,
        active: data.active || categoriesList.length
      }
    } else {
      throw new Error(data?.error || 'Kategoriler alınamadı')
    }
  } catch (error) {
    const errorMessage = error.message || 'Kategoriler alınamadı'
    return {
      success: false,
      error: errorMessage,
      statusCode: error.status,
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
    const apiBase = getIdeasoftApiBase()
    // Supabase Edge Function kullan (ideasoft-products ile aynı endpoint)
    const apiUrl = `${apiBase}/${IDEASOFT_EDGE_FUNCTIONS.PRODUCTS}`
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        shopId,
        accessToken,
        product
      })
    })

    const data = await response.json().catch(() => ({}))

    if (data && data.success) {
      return { success: true, data: data.data }
    }

    return { success: false, error: normalizeErrorMessage(data?.error || 'Silinmiş ürün yeniden oluşturulamadı') }
  } catch (error) {
    const errorMessage = error.message || 'Silinmiş ürün yeniden oluşturulamadı'
    return { success: false, error: normalizeErrorMessage(errorMessage), statusCode: error.status }
  }
}

export const getCategory = async (accessToken, shopId, categoryId) => {
  try {
    const apiBase = getIdeasoftApiBase()
    const apiUrl = `${apiBase}/${IDEASOFT_EDGE_FUNCTIONS.CATEGORIES}?shopId=${encodeURIComponent(shopId)}&accessToken=${encodeURIComponent(accessToken)}&categoryId=${encodeURIComponent(categoryId)}`

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: getAuthHeaders()
    })

    const data = await response.json().catch(() => ({}))

    if (data && data.success) {
      const category = data.data
      return { success: true, data: category }
    } else {
      throw new Error(data?.error || 'Kategori alınamadı')
    }
  } catch (error) {
    console.error('Category API Error:', error)
    const errorMessage = error.message || 'Kategori alınamadı'
    return {
      success: false,
      error: errorMessage,
      statusCode: error.status
    }
  }
}
