/**
 * Genel hata yönetimi ve mesaj normalizasyonu
 */

/**
 * Hata mesajını normalize eder - duplicate hatalarını Türkçe'ye çevirir
 * @param {string|Error} errorMessage - Hata mesajı veya Error objesi
 * @returns {string} Normalize edilmiş hata mesajı
 */
export const normalizeErrorMessage = (errorMessage) => {
  if (!errorMessage) return 'Bilinmeyen hata';
  
  // Error objesi ise message'ını al
  const msg = String(errorMessage?.message || errorMessage || '').toLowerCase().trim();
  
  if (!msg) return 'Bilinmeyen hata';
  
  // Duplicate hatalarını yakala
  if (
    msg.includes('duplicate entry') || 
    msg.includes('duplicate') || 
    msg.includes('aynı sku') ||
    msg.includes('aynı ürün') ||
    msg.includes('already exists') ||
    msg.includes('zaten var') ||
    msg.includes('mevcut')
  ) {
    return 'Aynı üründen var';
  }
  
  // Network hataları
  if (msg.includes('network error') || msg.includes('network') || msg.includes('timeout') || msg.includes('econnreset')) {
    return 'Ağ hatası. Lütfen internet bağlantınızı kontrol edin.';
  }
  
  // Veritabanı bağlantı hataları
  if (msg.includes('econnreset') || msg.includes('connection lost') || msg.includes('protocol_connection_lost') || msg.includes('veritabanı bağlantısı')) {
    return 'Veritabanı bağlantısı kesildi. Lütfen sayfayı yenileyin ve tekrar deneyin.';
  }
  
  // 404 hataları
  if (msg.includes('not found') || msg.includes('404')) {
    return 'Ürün bulunamadı';
  }
  
  // 401/403 hataları
  if (msg.includes('unauthorized') || msg.includes('forbidden') || msg.includes('401') || msg.includes('403')) {
    return 'Yetkilendirme hatası. Lütfen API ayarlarınızı kontrol edin.';
  }
  
  // 500 hataları
  if (msg.includes('internal server error') || msg.includes('500')) {
    return 'Sunucu hatası. Lütfen daha sonra tekrar deneyin.';
  }
  
  // Orijinal mesajı döndür (eğer Türkçe değilse)
  return errorMessage?.message || errorMessage || 'Bilinmeyen hata';
};

/**
 * API hata yanıtından hata mesajını çıkarır
 * @param {Object} error - Axios error objesi
 * @returns {string} Normalize edilmiş hata mesajı
 */
export const extractApiErrorMessage = (error) => {
  if (!error) return 'Bilinmeyen hata';
  
  // Axios error yapısı
  const apiError = error?.response?.data?.error || 
                   error?.response?.data?.message || 
                   error?.response?.data?.errorMessage ||
                   error?.message || 
                   error;
  
  return normalizeErrorMessage(apiError);
};

/**
 * Duplicate hatası olup olmadığını kontrol eder
 * @param {string|Error|Object} error - Hata mesajı, Error objesi veya API yanıtı
 * @returns {boolean} Duplicate hatası mı?
 */
export const isDuplicateError = (error) => {
  if (!error) return false;
  
  const msg = String(
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    error?.response?.data?.errorMessage ||
    error?.message ||
    error
  ).toLowerCase().trim();
  
  return (
    msg.includes('duplicate entry') || 
    msg.includes('duplicate') || 
    msg.includes('aynı sku') ||
    msg.includes('aynı ürün') ||
    msg.includes('already exists') ||
    msg.includes('zaten var') ||
    msg.includes('mevcut') ||
    error?.duplicate === true
  );
};

