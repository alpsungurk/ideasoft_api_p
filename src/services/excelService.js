import * as XLSX from 'xlsx'

export const readExcelFile = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        
        // Hem raw (sayısal) hem de formatted (string) verileri al
        const jsonDataRaw = XLSX.utils.sheet_to_json(worksheet, { raw: true, defval: '' })
        const jsonDataFormatted = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' })
        
        // İki veriyi birleştir (raw sayısal değerleri tercih et, yoksa formatted kullan)
        const jsonData = jsonDataRaw.map((row, index) => {
          const formattedRow = jsonDataFormatted[index] || {}
          const mergedRow = { ...formattedRow }
          
          // Sayısal değerleri raw'dan al
          Object.keys(row).forEach(key => {
            if (typeof row[key] === 'number' && !isNaN(row[key])) {
              mergedRow[key] = row[key]
            } else if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
              mergedRow[key] = row[key]
            }
          })
          
          return mergedRow
        })
        
        resolve(jsonData)
      } catch (error) {
        reject(error)
      }
    }
    
    reader.onerror = (error) => reject(error)
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Fiyat değerini parse et (TL, ₺, virgül, nokta gibi karakterleri temizle)
 * "$ 1.200,00" formatını destekler
 * @param {any} value - Fiyat değeri
 * @returns {number} Parse edilmiş fiyat
 */
const parsePrice = (value) => {
  // Null, undefined veya boş string kontrolü
  if (value === null || value === undefined || value === '') return 0
  
  // String'e çevir
  let priceStr = String(value).trim()
  
  // Boşsa 0 döndür
  if (!priceStr || priceStr === '' || priceStr === '-' || priceStr === 'null' || priceStr === 'undefined') return 0
  
  // Eğer zaten sayı ise direkt döndür
  if (typeof value === 'number' && !isNaN(value)) {
    return value
  }
  
  // TL, ₺, $, € gibi para birimlerini kaldır
  priceStr = priceStr.replace(/[₺$€£TLtl]/g, '')
  
  // Boşlukları kaldır
  priceStr = priceStr.replace(/\s/g, '')
  
  // Özel format kontrolü: "$ 1.200,00" formatı (nokta binlik, virgül ondalık)
  // Eğer hem nokta hem virgül varsa ve virgül noktadan sonra geliyorsa
  const commaIndex = priceStr.lastIndexOf(',')
  const dotIndex = priceStr.lastIndexOf('.')
  
  if (commaIndex > dotIndex && commaIndex !== -1 && dotIndex !== -1) {
    // Türkçe/Avrupa formatı: 1.234,56 veya 1.200,00
    // Virgülden sonraki kısmı kontrol et (ondalık kısım)
    const afterComma = priceStr.substring(commaIndex + 1)
    if (afterComma.length <= 2) {
      // Kuruş formatı (1.200,00 veya 1.234,56)
      // Tüm noktaları kaldır (binlik ayırıcılar), virgülü noktaya çevir
      priceStr = priceStr.replace(/\./g, '').replace(',', '.')
    } else {
      // Beklenmeyen format, sadece noktaları kaldır
      priceStr = priceStr.replace(/\./g, '').replace(',', '.')
    }
  } else if (dotIndex > commaIndex && dotIndex !== -1 && commaIndex !== -1) {
    // İngilizce format: 1,234.56
    // Virgülleri kaldır (binlik ayırıcılar)
    priceStr = priceStr.replace(/,/g, '')
  } else if (commaIndex !== -1 && dotIndex === -1) {
    // Sadece virgül var
    const afterComma = priceStr.substring(commaIndex + 1)
    if (afterComma.length <= 2) {
      // Kuruş formatı (123,45)
      priceStr = priceStr.replace(',', '.')
    } else {
      // Binlik ayırıcı olabilir, virgülü kaldır
      priceStr = priceStr.replace(/,/g, '')
    }
  } else if (dotIndex !== -1 && commaIndex === -1) {
    // Sadece nokta var
    const afterDot = priceStr.substring(dotIndex + 1)
    if (afterDot.length <= 2) {
      // Ondalık formatı (123.45) - olduğu gibi bırak
    } else {
      // Binlik ayırıcı olabilir, noktaları kaldır
      priceStr = priceStr.replace(/\./g, '')
    }
  }
  
  // Sadece sayı, nokta ve eksi işaretini bırak
  priceStr = priceStr.replace(/[^\d.-]/g, '')
  
  // Parse et
  const parsed = parseFloat(priceStr)
  
  // NaN veya geçersizse 0 döndür
  return isNaN(parsed) ? 0 : parsed
}

export const mapExcelColumns = (excelData) => {
  if (!excelData || excelData.length === 0) return []
  
  // İlk satırdan sütun isimlerini al
  const columns = Object.keys(excelData[0])
  
  // Debug: Kolon isimlerini logla
  console.log('Excel kolonları:', columns)
  
  return excelData.map((row, index) => {
    const product = {}
    
    // Excel yapısına göre spesifik kolon eşleştirmeleri
    columns.forEach(col => {
      const colLower = col.toLowerCase().trim()
      
      // SAP -> SKU
      if (colLower === 'sap') {
        product.sku = String(row[col] || '').trim()
      }
      // ÜRETİCİ KODU -> manufacturerCode
      else if (colLower === 'üretici kodu' || colLower === 'üretici_kodu' || colLower.includes('üretici') && colLower.includes('kod')) {
        product.manufacturerCode = String(row[col] || '').trim()
      }
      // MODEL NAME -> name
      else if (colLower === 'model name' || colLower === 'model_name' || colLower === 'model' || 
               (colLower.includes('model') && colLower.includes('name'))) {
        product.name = String(row[col] || '').trim()
      }
      // GÜNE ÖZEL Fİ -> price
      else if (colLower === 'güne özel fi' || colLower === 'güne_özel_fi' || 
               colLower.includes('güne') && colLower.includes('özel') ||
               colLower.includes('fiyat') || colLower.includes('price')) {
        const priceValue = row[col]
        
        // Eğer zaten sayı ise direkt kullan
        if (typeof priceValue === 'number' && !isNaN(priceValue)) {
          product.price = priceValue
        } else {
          // String ise parse et (format: "$ 1.200,00" -> 1200.00)
          const parsedPrice = parsePrice(priceValue)
          product.price = parsedPrice
        }
        
        // Debug için
        if (index === 0) {
          console.log(`Fiyat kolonu bulundu: "${col}" = "${priceValue}" (${typeof priceValue}) -> ${product.price}`)
        }
      }
      // KATEGORİ -> category
      else if (colLower === 'kategori' || colLower === 'category' || colLower.includes('kategori')) {
        product.category = String(row[col] || '').trim()
      }
      // Genel eşleştirmeler (geriye dönük uyumluluk için)
      // Ürün adı
      else if ((colLower.includes('ürün') && (colLower.includes('ad') || colLower.includes('isim'))) || 
               colLower.includes('name') || 
               colLower.includes('title') ||
               colLower === 'ürün' ||
               colLower === 'product') {
        if (!product.name) {
          product.name = String(row[col] || '').trim()
        }
      } 
      // SKU (genel)
      else if (colLower.includes('sku') || 
               colLower.includes('barkod') ||
               colLower === 'sku') {
        if (!product.sku) {
          product.sku = String(row[col] || '').trim()
        }
      } 
      // Stok
      else if (colLower.includes('stok') || 
               colLower.includes('stock') || 
               colLower.includes('quantity') ||
               colLower === 'stok' ||
               colLower === 'stock') {
        product.stock = parseInt(row[col]) || 0
      } 
      // Açıklama
      else if (colLower.includes('açıklama') || 
               colLower.includes('description') || 
               colLower.includes('desc') ||
               colLower === 'açıklama' ||
               colLower === 'description') {
        product.description = String(row[col] || '').trim()
      } 
      // Resim
      else if (colLower.includes('resim') || 
               colLower.includes('image') || 
               colLower.includes('foto') ||
               colLower === 'resim' ||
               colLower === 'image') {
        product.image = String(row[col] || '').trim()
      } 
      // Marka
      else if (colLower.includes('marka') || 
               colLower.includes('brand') ||
               colLower === 'marka' ||
               colLower === 'brand') {
        product.brand = String(row[col] || '').trim()
      }
    })
    
    // Debug: İlk ürün için log
    if (index === 0) {
      console.log('İlk ürün parse edildi:', product)
    }
    
    // Eğer name yoksa, MODEL NAME veya ilk sütunu name olarak kullan
    if (!product.name && columns.length > 0) {
      // Önce MODEL NAME kolonunu kontrol et
      const modelNameCol = columns.find(col => {
        const colLower = col.toLowerCase().trim()
        return colLower === 'model name' || colLower === 'model_name' || colLower === 'model'
      })
      if (modelNameCol) {
        product.name = String(row[modelNameCol] || '').trim()
      } else {
        product.name = String(row[columns[0]] || `Ürün ${index + 1}`).trim()
      }
    }
    
    // Eğer SKU yoksa, SAP veya name'den oluştur
    if (!product.sku) {
      const sapCol = columns.find(col => col.toLowerCase().trim() === 'sap')
      if (sapCol && row[sapCol]) {
        product.sku = String(row[sapCol]).trim()
      } else if (product.name) {
        product.sku = product.name.toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
      }
    }
    
    return product
  })
}

