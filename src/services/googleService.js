import axios from 'axios'

// Google arama servisi
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY
const GOOGLE_SEARCH_ENGINE_ID = import.meta.env.VITE_GOOGLE_SEARCH_ENGINE_ID

/**
 * Google Custom Search API ile ürün görselini bul
 */
export const findImageWithGoogle = async (query) => {
  try {
    const response = await fetch('http://localhost:3001/api/google/image-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    })
    const payload = await response.json().catch(() => null)
    
    // Quota exceeded kontrolü
    if (payload?.quotaExceeded || (payload?.error && payload.error.includes('hakkınız doldu'))) {
      throw new Error('GOOGLE_QUOTA_EXCEEDED')
    }
    
    return payload?.url || null
  } catch (error) {
    if (error.message === 'GOOGLE_QUOTA_EXCEEDED') {
      throw error
    }
    return null;
  }
}

/**
 * Ürün bilgilerini (web sitesi snippet'ları) Google Custom Search ile bul
 */
export const findWebInfoWithGoogle = async (query) => {
  try {
    const response = await fetch('http://localhost:3001/api/google/web-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    })
    const payload = await response.json().catch(() => null)
    return payload?.items || []
  } catch (error) {
    console.warn('Google Web Search Error:', error.message);
    return [];
  }
}

/**
 * Toplu ürün resmi bulma (Google üzerinden)
 */
export const enrichImagesWithGoogle = async (products, onProgress) => {
  const enrichedProducts = [...products];
  let processedCount = 0;

  for (let i = 0; i < enrichedProducts.length; i++) {
    const p = enrichedProducts[i];
    if (p.image) {
      processedCount++;
      continue;
    }

    if (onProgress) {
      onProgress({
        current: processedCount,
        total: products.length,
        product: p.name,
        message: 'Google ile resim aranıyor...'
      });
    }

    const query = `${p.brand || ''} ${p.name}`.trim();
    const imageUrl = await findImageWithGoogle(query);
    if (imageUrl) {
      p.image = imageUrl;
    }

    processedCount++;
    if (onProgress) {
      onProgress({
        current: processedCount,
        total: products.length,
        product: p.name,
        message: imageUrl ? 'Resim bulundu' : 'Resim bulunamadı'
      });
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  return enrichedProducts;
}

/**
 * Toplu ürün bilgisi bulma (Resim + Açıklama/Snippet)
 * Yapay zeka kullanmadan sadece Google Search Engine sonuçlarını kullanır.
 */
export const enrichProductsWithGoogle = async (products, onProgress) => {
  const enrichedProducts = [...products];
  let processedCount = 0;

  for (let i = 0; i < enrichedProducts.length; i++) {
    const p = enrichedProducts[i];

    // Eğer hem resim hem açıklama varsa atla
    if (p.image && p.description && p.description.length > 50) {
      processedCount++;
      continue;
    }

    if (onProgress) {
      onProgress({
        current: processedCount,
        total: products.length,
        product: p.name,
        message: 'Google ile eksik resim ve bilgiler tamamlanıyor...'
      });
    }

    const query = `${p.brand || ''} ${p.name}`.trim();

    // 1. Resim Bul (Eğer yoksa)
    if (!p.image) {
      const imageUrl = await findImageWithGoogle(query);
      if (imageUrl) p.image = imageUrl;
    }

    // 2. Bilgi/Açıklama Bul (Eğer yoksa)
    if (!p.description || p.description.length < 20) {
      const searchQuery = `${p.brand || ''} ${p.name} özellikleri teknik detaylar`.trim();
      const webResults = await findWebInfoWithGoogle(searchQuery);

      if (webResults && webResults.length > 0) {
        // Google arama sonuçlarını tablo formatında açıklama olarak formatla
        try {
          const response = await fetch('http://localhost:3001/api/google/format-description', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productName: p.name,
              brand: p.brand || '',
              searchResults: webResults
            })
          });
          
          const result = await response.json().catch(() => null);
          if (result?.success && result.description) {
            p.description = result.description;
          } else {
            // Fallback: eski yöntem
            const combinedSnippets = webResults
              .map(r => `<p style=\"box-sizing: border-box; margin: 0px 0px 11px; color: #666a6c; font-family: InterVariable, Helvetica, Arial, sans-serif; font-size: 13px; background-color: #ffffff; outline: none !important;\"><strong>${r.title}</strong>: ${r.snippet}</p>`)
              .join('\\n');
            p.description = combinedSnippets;
          }
        } catch (error) {
          console.warn('Format description error, using fallback:', error.message);
          // Fallback: eski yöntem
          const combinedSnippets = webResults
            .map(r => `<p style=\"box-sizing: border-box; margin: 0px 0px 11px; color: #666a6c; font-family: InterVariable, Helvetica, Arial, sans-serif; font-size: 13px; background-color: #ffffff; outline: none !important;\"><strong>${r.title}</strong>: ${r.snippet}</p>`)
            .join('\\n');
          p.description = combinedSnippets;
        }
      }
    }

    processedCount++;
    if (onProgress) {
      onProgress({
        current: processedCount,
        total: products.length,
        product: p.name,
        message: 'Görsel ve açıklamalar kaydedildi'
      });
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 800));
  }

  return enrichedProducts;
}

/**
 * Toplu ürün resmi bulma (Sadece Google üzerinden)
 * Açıklama oluşturma yapmaz, sadece resimleri doldurur.
 */
export const enrichProductImagesOnly = async (products, onProgress) => {
  const enrichedProducts = [...products];
  let processedCount = 0;

  for (let i = 0; i < enrichedProducts.length; i++) {
    const p = enrichedProducts[i];

    // Eğer resim zaten varsa atla
    if (p.image) {
      processedCount++;
      continue;
    }

    if (onProgress) {
      onProgress({
        current: processedCount,
        total: products.length,
        product: p.name,
        message: 'Google ile resim aranıyor...'
      });
    }

    const query = `${p.brand || ''} ${p.name}`.trim();
    try {
      const imageUrl = await findImageWithGoogle(query);
      if (imageUrl) {
        p.image = imageUrl;
      }
    } catch (error) {
      if (error.message === 'GOOGLE_QUOTA_EXCEEDED') {
        throw error; // Quota exceeded hatasını yukarı fırlat
      }
    }

    processedCount++;
    if (onProgress) {
      onProgress({
        current: processedCount,
        total: products.length,
        product: p.name,
        message: p.image ? 'Resim bulundu' : 'Resim bulunamadı'
      });
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  return enrichedProducts;
}