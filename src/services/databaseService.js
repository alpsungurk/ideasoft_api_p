import axios from 'axios'

// Supabase Edge Functions URL'i veya local proxy
// Production'da: https://project-id.supabase.co/functions/v1
// Local'de: /api/db (Vite proxy ile server.js'e yönlendirilir)
const getApiBase = () => {
  // Supabase Edge Functions kullan (hem local hem production)
  if (import.meta.env.VITE_SUPABASE_URL) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL.replace(/\/$/, '')
    return `${supabaseUrl}/functions/v1`
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
        
        const response = await axios.post(url, { products, projectName }, {
            headers: getAuthHeaders()
        })

        if (response.data && response.data.success) {
            return response.data
        } else {
            throw new Error(response.data?.error || 'Proje oluşturulamadı')
        }
    } catch (error) {
        console.error('Batch Create Error:', error)
        throw new Error(error.response?.data?.error || error.message || 'Proje oluşturulamadı')
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
        
        const response = await axios.get(url, {
            headers: getAuthHeaders(),
            timeout: 60000 // 60 saniye timeout
        })
        return response.data
    } catch (error) {
        console.error('Get Batches Error:', error)
        const errorMsg = error.response?.data?.error || error.message || 'Sunucu hatası oluştu'
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
        
        const response = await axios.get(url, {
            headers: getAuthHeaders(),
            timeout: 60000 // 60 saniye timeout
        })
        return response.data
    } catch (error) {
        console.error('Get Batch Details Error:', error)
        const errorMsg = error.response?.data?.error || error.message || 'Veritabanı bağlantı hatası'
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
        
        const response = await axios.post(url, { batchId }, {
            headers: getAuthHeaders()
        })
        return response.data
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
        
        const response = await axios.post(url, {
            sku,
            ideasoftId,
            status,
            error
        }, {
            headers: getAuthHeaders()
        })
        return response.data
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
        
        const response = await axios.post(url, {
            sku,
            categoryId,
            categoryName
        }, {
            headers: getAuthHeaders()
        })
        return response.data
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
        
        const response = await axios.patch(url, patch, {
            headers: getAuthHeaders()
        })
        return response.data
    } catch (error) {
        console.error('Update Imported Product Error:', error)
        return { success: false, error: error.response?.data?.error || error.message }
    }
}
