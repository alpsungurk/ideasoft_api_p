import axios from 'axios'

const API_BASE = '/api/db'

/**
 * Yeni proje (batch) oluştur ve ürünleri kaydet
 */
export const createBatch = async (products, projectName) => {
    try {
        const response = await axios.post(`${API_BASE}/create-batch`, { products, projectName }, {
            headers: { 'Content-Type': 'application/json' }
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
        const response = await axios.get(`${API_BASE}/batches`, {
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
        const response = await axios.get(`${API_BASE}/batches/${id}`, {
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
        const response = await axios.post(`${API_BASE}/update-batch-stats`, { batchId })
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
        const response = await axios.post(`${API_BASE}/update-status`, {
            sku,
            ideasoftId,
            status,
            error
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
        const response = await axios.post(`${API_BASE}/update-category`, {
            sku,
            categoryId,
            categoryName
        })
        return response.data
    } catch (error) {
        console.error('Category Update Error:', error)
        return { success: false, error: error.message }
    }
}

export const updateImportedProduct = async (id, patch) => {
    try {
        const response = await axios.patch(`${API_BASE}/imported-products/${id}`, patch, {
            headers: { 'Content-Type': 'application/json' }
        })
        return response.data
    } catch (error) {
        console.error('Update Imported Product Error:', error)
        return { success: false, error: error.response?.data?.error || error.message }
    }
}
