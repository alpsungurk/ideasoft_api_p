import axios from 'axios'
import { scrapeProductInfo } from './scrapeService'

// Google arama ve veri toplama servisi
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY
const GOOGLE_SEARCH_ENGINE_ID = import.meta.env.VITE_GOOGLE_SEARCH_ENGINE_ID

/**
 * Google Custom Search API ve web scraping ile ürün bilgilerini ara
 * @param {string} productName - Ürün adı
 * @param {string} brand - Marka (opsiyonel)
 * @param {string} url - Ürün URL'i (opsiyonel)
 * @returns {Promise<Object>} Açıklama ve resim URL'i
 */
export const searchProductInfo = async (productName, brand = '', url = '') => {
  try {
    // Önce web scraping ile ürün bilgilerini çek
    const scrapedInfo = await scrapeProductInfo(productName, brand, url)
    
    let description = scrapedInfo.description
    let imageUrl = scrapedInfo.image

    // Eğer scraping'den resim gelmediyse, Google Image Search kullan
    if (!imageUrl && GOOGLE_API_KEY && GOOGLE_SEARCH_ENGINE_ID) {
      const searchQuery = `${brand} ${productName}`.trim()
      
      try {
        const searchResponse = await axios.get('https://www.googleapis.com/customsearch/v1', {
          params: {
            key: GOOGLE_API_KEY,
            cx: GOOGLE_SEARCH_ENGINE_ID,
            q: searchQuery,
            searchType: 'image',
            num: 1
          }
        })

        if (searchResponse.data.items && searchResponse.data.items.length > 0) {
          imageUrl = searchResponse.data.items[0].link
        }
      } catch (error) {
        console.warn('Google Custom Search API hatası:', error.message)
      }
    }
    
    // Eğer hala resim yoksa, Unsplash kullan
    if (!imageUrl) {
      imageUrl = await getProductImage(productName, brand)
    }

    // Eğer açıklama generic ise (fallback açıklama), tekrar dene
    if (!description || description.length < 30 || description.includes('Yüksek kaliteli ve güvenilir ürün')) {
      // API'den gelen açıklama generic ise, tekrar scraping yapmayı dene
      if (scrapedInfo.url) {
        try {
          const retryResponse = await axios.post(`${import.meta.env.DEV ? 'http://localhost:3000/api' : '/api'}/scrape`, {
            productName,
            brand,
            url: scrapedInfo.url
          }, {
            timeout: 20000
          })
          
          if (retryResponse.data && retryResponse.data.description && 
              retryResponse.data.description.length > 50 &&
              !retryResponse.data.description.includes('Yüksek kaliteli ve güvenilir ürün')) {
            description = retryResponse.data.description
            if (retryResponse.data.image) {
              imageUrl = retryResponse.data.image
            }
          }
        } catch (retryError) {
          console.warn('Retry scraping failed:', retryError.message)
        }
      }
      
      // Hala yoksa, generic açıklama oluştur
      if (!description || description.length < 30 || description.includes('Yüksek kaliteli ve güvenilir ürün')) {
        description = await generateDescription(productName, brand)
      }
    }
    
    return {
      description,
      image: imageUrl,
      url: scrapedInfo.url || ''
    }
  } catch (error) {
    console.error('Google search error:', error)
    return {
      description: generateFallbackDescription(productName, brand),
      image: await getProductImage(productName, brand),
      url: ''
    }
  }
}

/**
 * Fallback açıklama oluştur
 */
function generateFallbackDescription(productName, brand = '') {
  const brandText = brand ? `${brand} marka ` : ''
  return `${brandText}${productName} - Yüksek kaliteli ve güvenilir ürün. Detaylı bilgi ve özellikler için ürün sayfasını ziyaret edin.`
}

/**
 * Ürün açıklaması oluştur (fallback)
 * @param {string} productName - Ürün adı
 * @param {string} brand - Marka
 * @returns {Promise<string>} Açıklama
 */
const generateDescription = async (productName, brand) => {
  return generateFallbackDescription(productName, brand)
}

/**
 * Unsplash API ile ürün resmi al
 * @param {string} productName - Ürün adı
 * @param {string} brand - Marka
 * @returns {Promise<string>} Resim URL'i
 */
const getProductImage = async (productName, brand) => {
  try {
    const searchQuery = encodeURIComponent(`${brand} ${productName}`.trim())
    // Unsplash Source API (ücretsiz, API key gerektirmez)
    // Gerçek uygulamada Unsplash API key ile daha iyi sonuçlar alınabilir
    return `https://source.unsplash.com/800x600/?${searchQuery}`
  } catch (error) {
    return ''
  }
}

export const enrichProducts = async (products, onProgress) => {
  const enrichedProducts = []
  const total = products.length

  for (let i = 0; i < products.length; i++) {
    const product = products[i]
    
    // Eğer açıklama veya resim eksikse, Google'dan ara ve scrape et
    if (!product.description || !product.image) {
      const info = await searchProductInfo(product.name, product.brand, product.url)
      
      if (!product.description && info.description) {
        product.description = info.description
      }
      
      if (!product.image && info.image) {
        product.image = info.image
      }

      // URL'i de kaydet
      if (info.url && !product.url) {
        product.url = info.url
      }
    }

    enrichedProducts.push(product)
    
    if (onProgress) {
      onProgress({
        current: i + 1,
        total,
        product: product.name,
        message: product.description ? 'Bilgiler toplandı' : 'Aranıyor...'
      })
    }

    // Rate limiting için bekleme (scraping için daha uzun süre)
    if (i < products.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  return enrichedProducts
}


