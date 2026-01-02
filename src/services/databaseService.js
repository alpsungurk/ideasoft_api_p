// Supabase Edge Functions URL'i veya local proxy
// Production'da: https://project-id.supabase.co/functions/v1
// Local'de: /api/db (Vite proxy ile server.js'e yönlendirilir)
const getApiBase = () => {
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
  return '/api/db'
}

// Edge Function isimleri
const EDGE_FUNCTIONS = {
  BATCHES: 'db-batches',
  BATCH_BY_ID: 'db-batch-by-id',
  CREATE_BATCH: 'db-create-batch',
  UPDATE_PRODUCT: 'db-update-product',
  UPDATE_PRODUCTS_BATCH: 'db-update-products-batch',
  UPDATE_STATUS: 'db-update-status',
  UPDATE_CATEGORY: 'db-update-category',
  UPDATE_BATCH_STATS: 'db-update-batch-stats'
}

// Authorization header (anon key veya service role key)
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
 * Yeni proje (batch) oluştur ve ürünleri kaydet
 */
export const createBatch = async (products, projectName) => {
    try {
        const apiBase = getApiBase()
        // Edge Functions kullan (hem local hem production)
        const url = apiBase.includes('functions/v1')
            ? `${apiBase}/${EDGE_FUNCTIONS.CREATE_BATCH}`
            : `${apiBase}/create-batch`
        
        const response = await fetch(url, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ products, projectName })
        })

        const data = await response.json().catch(() => ({}))

        if (data && data.success) {
            return data
        } else {
            throw new Error(data?.error || 'Proje oluşturulamadı')
        }
    } catch (error) {
        console.error('Batch Create Error:', error)
        throw new Error(error.message || 'Proje oluşturulamadı')
    }
}

/**
 * Tüm projeleri getir
 */
export const getBatches = async () => {
    try {
        const apiBase = getApiBase()
        // Edge Functions kullan (hem local hem production)
        const url = apiBase.includes('functions/v1')
            ? `${apiBase}/${EDGE_FUNCTIONS.BATCHES}`
            : `${apiBase}/batches`
        
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 60000)

        const response = await fetch(url, {
            method: 'GET',
            headers: getAuthHeaders(),
            signal: controller.signal
        })

        clearTimeout(timeoutId)

        const data = await response.json().catch(() => ({ success: false, error: 'Sunucu hatası oluştu' }))
        return data
    } catch (error) {
        console.error('Get Batches Error:', error)
        const errorMsg = error.message || 'Sunucu hatası oluştu'
        return { success: false, error: errorMsg }
    }
}

/**
 * Proje detaylarını ve ürünlerini getir
 */
export const getBatchDetails = async (id) => {
    try {
        const apiBase = getApiBase()
        // Edge Functions kullan (hem local hem production)
        const url = apiBase.includes('functions/v1')
            ? `${apiBase}/${EDGE_FUNCTIONS.BATCH_BY_ID}/${id}`
            : `${apiBase}/batches/${id}`
        
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 60000)

        const response = await fetch(url, {
            method: 'GET',
            headers: getAuthHeaders(),
            signal: controller.signal
        })

        clearTimeout(timeoutId)

        const data = await response.json().catch(() => ({ success: false, error: 'Veritabanı bağlantı hatası' }))
        return data
    } catch (error) {
        console.error('Get Batch Details Error:', error)
        const errorMsg = error.message || 'Veritabanı bağlantı hatası'
        return { success: false, error: errorMsg }
    }
}

/**
 * Batch istatistiklerini güncelle
 */
export const updateBatchStats = async (batchId) => {
    try {
        const apiBase = getApiBase()
        // Edge Functions kullan (hem local hem production)
        const url = apiBase.includes('functions/v1')
            ? `${apiBase}/${EDGE_FUNCTIONS.UPDATE_BATCH_STATS}`
            : `${apiBase}/update-batch-stats`
        
        const response = await fetch(url, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ batchId })
        })

        const data = await response.json().catch(() => ({ success: false, error: error.message }))
        return data
    } catch (error) {
        console.error('Update Batch Stats Error:', error)
        return { success: false, error: error.message }
    }
}

/**
 * Ürünün Ideasoft durumunu güncelle
 */
export const updateProductStatus = async (sku, ideasoftId, status, error = null) => {
    try {
        const apiBase = getApiBase()
        // Edge Functions kullan (hem local hem production)
        const url = apiBase.includes('functions/v1')
            ? `${apiBase}/${EDGE_FUNCTIONS.UPDATE_STATUS}`
            : `${apiBase}/update-status`
        
        const response = await fetch(url, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
            sku,
            ideasoftId,
            status,
            error
        })
        })

        const data = await response.json().catch(() => ({ success: false, error: error.message }))
        return data
    } catch (error) {
        console.error('Status Update Error:', error)
        return { success: false, error: error.message }
    }
}

/**
 * Ürünün kategori seçimini güncelle
 */
export const updateProductCategory = async (sku, categoryId, categoryName) => {
    try {
        const apiBase = getApiBase()
        // Edge Functions kullan (hem local hem production)
        const url = apiBase.includes('functions/v1')
            ? `${apiBase}/${EDGE_FUNCTIONS.UPDATE_CATEGORY}`
            : `${apiBase}/update-category`
        
        const response = await fetch(url, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
            sku,
            categoryId,
            categoryName
        })
        })

        const data = await response.json().catch(() => ({ success: false, error: error.message }))
        return data
    } catch (error) {
        console.error('Category Update Error:', error)
        return { success: false, error: error.message }
    }
}

export const updateImportedProduct = async (id, patch) => {
    try {
        const apiBase = getApiBase()
        // Edge Functions kullan (hem local hem production)
        const url = apiBase.includes('functions/v1')
            ? `${apiBase}/${EDGE_FUNCTIONS.UPDATE_PRODUCT}/${id}`
            : `${apiBase}/imported-products/${id}`
        
        const response = await fetch(url, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify(patch)
        })

        const data = await response.json().catch(() => ({ success: false, error: 'Network error' }))
        return data
    } catch (error) {
        console.error('Update Imported Product Error:', error)
        return { success: false, error: error.message }
    }
}

export const updateImportedProductsBatch = async (updates) => {
    try {
        const apiBase = getApiBase()
        const url = apiBase.includes('functions/v1')
            ? `${apiBase}/${EDGE_FUNCTIONS.UPDATE_PRODUCTS_BATCH}`
            : `${apiBase}/imported-products/batch`
        
        const response = await fetch(url, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ updates })
        })

        const data = await response.json().catch(() => ({ success: false, error: 'Network error' }))
        return data
    } catch (error) {
        console.error('Update Imported Products Batch Error:', error)
        return { success: false, error: error.message }
    }
}
