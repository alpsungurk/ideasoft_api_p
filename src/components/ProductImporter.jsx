import { useState, useEffect, useRef } from 'react'
import { readExcelFile, mapExcelColumns } from '../services/excelService'
import { enrichProducts } from '../services/googleService'
import { bulkCreateProducts, getStoredToken, getCategories } from '../services/ideasoftService'
import ProductTable from './ProductTable'
import ConfigForm from './ConfigForm'
import './ProductImporter.css'

const ProductImporter = () => {
  // Her zaman açılış sayfası token alma (Step 1)
  const [step, setStep] = useState(1) // 1: Token Alma, 2: Excel Parse, 3: Gönderme
  const [products, setProducts] = useState([])
  const [originalProducts, setOriginalProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [config, setConfig] = useState({
    apiKey: '',
    shopId: ''
  })
  const [results, setResults] = useState(null)
  const [editAll, setEditAll] = useState(false)
  const [selectedProducts, setSelectedProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loadingCategories, setLoadingCategories] = useState(false)
  const productTableRef = useRef(null)

  // Sayfa yüklendiğinde kayıtlı token'ı kontrol et
  useEffect(() => {
    const storedToken = getStoredToken()
    if (storedToken && storedToken.access_token) {
      setConfig(prev => ({
        ...prev,
        apiKey: storedToken.access_token,
        shopId: storedToken.shopId || prev.shopId
      }))
      // Token varsa bile açılış sayfası token alma olacak
      // Kullanıcı token'ı onayladıktan sonra Excel yükleme adımına geçecek
    }
    // Her zaman açılış sayfası token alma (Step 1)
    setStep(1)
    
    // History state'ini ayarla
    window.history.replaceState({ step: 1 }, '', window.location.pathname)
  }, [])

  // Tarayıcı geri/ileri butonlarını dinle
  useEffect(() => {
    const handlePopState = (event) => {
      if (event.state && event.state.step) {
        setStep(event.state.step)
      } else {
        // State yoksa Step 1'e dön
        setStep(1)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  // Step değiştiğinde history'ye push et
  useEffect(() => {
    if (step > 0) {
      window.history.pushState({ step }, '', window.location.pathname)
    }
  }, [step])

  // Kategorileri yükle
  const loadCategories = async () => {
    const storedToken = getStoredToken()
    if (!storedToken || !storedToken.access_token || !config.shopId) {
      console.log('⚠️ Kategoriler yüklenemedi: Token veya Shop ID eksik')
      return
    }

    setLoadingCategories(true)
    console.log('🔄 Kategoriler yükleniyor...')
    
    try {
      const result = await getCategories(storedToken.access_token, config.shopId)
      
      if (result.success && result.data) {
        console.log('✅ Kategoriler başarıyla yüklendi:', {
          toplam: result.total,
          aktif: result.active,
          kategoriler: result.data
        })
        setCategories(result.data)
      } else {
        console.error('❌ Kategoriler yüklenemedi:', result.error)
      }
    } catch (error) {
      console.error('❌ Kategoriler yüklenirken hata:', error)
    } finally {
      setLoadingCategories(false)
    }
  }

  // Step 3'e geçildiğinde kategorileri yükle
  useEffect(() => {
    if (step === 3 && products.length > 0 && config.shopId) {
      loadCategories()
    }
  }, [step, products.length, config.shopId])

  const handleFileUpload = async (event) => {
    // Token kontrolü - token yoksa Excel yüklenemez
    if (!config.apiKey) {
      alert('Lütfen önce token alın!')
      setStep(1)
      return
    }

    const file = event.target.files[0]
    if (!file) return

    setLoading(true)
    setProgress({ current: 0, total: 100, message: 'Excel dosyası parse ediliyor...' })
    
    try {
      const excelData = await readExcelFile(file)
      setProgress({ current: 50, total: 100, message: 'Ürünler işleniyor...' })
      const mappedProducts = mapExcelColumns(excelData)
      setOriginalProducts(mappedProducts)
      setProducts(mappedProducts)
      setProgress({ current: 100, total: 100, message: 'Parse tamamlandı!' })
      
      // Excel parse edildikten sonra direkt gönderme adımına geç
      setTimeout(() => {
        setStep(3) // Gönderme adımına geç
        setProgress(null)
      }, 500)
    } catch (error) {
      alert('Excel dosyası okunurken hata oluştu: ' + error.message)
      setProgress(null)
    } finally {
      setLoading(false)
    }
  }

  const handleEnrichData = async () => {
    setLoading(true)
    setProgress({ current: 0, total: products.length, message: 'Veriler zenginleştiriliyor...' })
    
    try {
      const enriched = await enrichProducts([...products], (prog) => {
        setProgress(prog)
      })
      setProducts(enriched)
      alert('Veriler başarıyla zenginleştirildi!')
    } catch (error) {
      alert('Veri zenginleştirme hatası: ' + error.message)
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  const handleConfigSubmit = (newConfig) => {
    setConfig(newConfig)
    // Token alındıktan sonra Excel yükleme adımına geç
    setStep(2)
  }

  const handleImport = async () => {
    if (!config.apiKey || !config.shopId) {
      alert('Lütfen API Key ve Shop ID giriniz!')
      return
    }

    setLoading(true)
    setProgress({ current: 0, total: products.length, message: 'Ürünler aktarılıyor...' })

    try {
      const importResults = await bulkCreateProducts(
        products,
        config.apiKey,
        config.shopId,
        (prog) => {
          setProgress(prog)
        }
      )

      const successCount = importResults.filter(r => r.success).length
      const failCount = importResults.filter(r => !r.success).length

      setResults({
        total: importResults.length,
        success: successCount,
        failed: failCount,
        details: importResults
      })

      alert(`${successCount} ürün başarıyla aktarıldı, ${failCount} ürün başarısız oldu.`)
    } catch (error) {
      alert('Aktarım hatası: ' + error.message)
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  const handleReset = () => {
    setStep(1) // Token alma adımına dön
    setProducts([])
    setOriginalProducts([])
    setResults(null)
    setProgress(null)
    // Token'ı da temizle
    localStorage.removeItem('ideasoft_token')
    localStorage.removeItem('ideasoft_token_expires')
    localStorage.removeItem('ideasoft_shopId')
    setConfig({
      apiKey: '',
      shopId: ''
    })
  }

  const handleProductUpdate = (index, updatedProduct) => {
    const newProducts = [...products]
    newProducts[index] = updatedProduct
    setProducts(newProducts)
  }

  const handleProductDelete = (index) => {
    const newProducts = products.filter((_, i) => i !== index)
    setProducts(newProducts)
    setOriginalProducts(newProducts)
    setSelectedProducts(selectedProducts.filter(i => i !== index).map(i => i > index ? i - 1 : i))
  }

  const handleDeleteSelected = () => {
    if (selectedProducts.length === 0) {
      alert('Lütfen silmek istediğiniz ürünleri seçin!')
      return
    }
    if (window.confirm(`${selectedProducts.length} ürünü silmek istediğinize emin misiniz?`)) {
      const newProducts = products.filter((_, i) => !selectedProducts.includes(i))
      setProducts(newProducts)
      setOriginalProducts(newProducts)
      setSelectedProducts([])
    }
  }

  const handleSelectProduct = (index) => {
    setSelectedProducts(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    )
  }

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedProducts(products.map((_, i) => i))
    } else {
      setSelectedProducts([])
    }
  }

  const handleSaveAll = () => {
    // ProductTable'daki handleSaveAll'u çağır
    if (productTableRef.current && productTableRef.current.saveAll) {
      productTableRef.current.saveAll()
    }
  }

  // Kategorileri hiyerarşik olarak organize et (ProductTable'daki ile aynı)
  const organizeCategories = (categories) => {
    if (!categories || categories.length === 0) return []
    
    const allCategories = categories.map(cat => ({
      ...cat,
      parentId: cat.parentId || (cat.parent ? cat.parent.id : null),
      children: []
    }))
    
    const rootCategories = []
    const processed = new Set()
    
    const buildHierarchy = (category) => {
      if (processed.has(category.id)) return null
      processed.add(category.id)
      
      const categoryCopy = { ...category, children: [] }
      
      allCategories.forEach(cat => {
        const catParentId = cat.parentId || (cat.parent ? cat.parent.id : null)
        if (catParentId === category.id) {
          const child = buildHierarchy(cat)
          if (child) {
            categoryCopy.children.push(child)
          }
        }
      })
      
      categoryCopy.children.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      
      return categoryCopy
    }
    
    allCategories.forEach(cat => {
      const catParentId = cat.parentId || (cat.parent ? cat.parent.id : null)
      if (!catParentId) {
        const hierarchy = buildHierarchy(cat)
        if (hierarchy) {
          rootCategories.push(hierarchy)
        }
      }
    })
    
    rootCategories.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    
    return rootCategories
  }

  // Hiyerarşik kategorileri düzleştirilmiş liste olarak render et
  const renderCategoryOptions = (categoryList, level = 0) => {
    const options = []
    const indent = '  '.repeat(level)
    const prefix = level > 0 ? '└─ ' : ''
    
    categoryList.forEach(category => {
      options.push(
        <option key={category.id} value={category.id}>
          {indent}{prefix}{category.name}
        </option>
      )
      
      if (category.children && category.children.length > 0) {
        options.push(...renderCategoryOptions(category.children, level + 1))
      }
    })
    
    return options
  }

  // Tüm ürünlere kategori ata
  const handleBulkCategoryAssign = (categoryId) => {
    if (!categoryId) return
    
    const selectedCategory = categories.find(cat => cat.id === parseInt(categoryId))
    if (!selectedCategory) return
    
    const updatedProducts = products.map(product => ({
      ...product,
      categoryId: selectedCategory.id,
      category: selectedCategory,
      categoryName: selectedCategory.name
    }))
    
    setProducts(updatedProducts)
    
    // Eğer editAll modundaysa, editedProducts'ı da güncelle
    if (editAll) {
      const updatedEdited = {}
      updatedProducts.forEach((product, index) => {
        updatedEdited[index] = product
      })
      setEditedProducts(updatedEdited)
    }
    
    alert(`${updatedProducts.length} ürünün kategorisi "${selectedCategory.name}" olarak güncellendi.`)
  }

  // Tüm ürünlerden kategoriyi kaldır
  const handleBulkCategoryRemove = () => {
    const updatedProducts = products.map(product => ({
      ...product,
      categoryId: null,
      category: null,
      categoryName: null
    }))
    
    setProducts(updatedProducts)
    
    // Eğer editAll modundaysa, editedProducts'ı da güncelle
    if (editAll) {
      const updatedEdited = {}
      updatedProducts.forEach((product, index) => {
        updatedEdited[index] = product
      })
      setEditedProducts(updatedEdited)
    }
    
    alert(`${updatedProducts.length} ürünün kategorisi kaldırıldı.`)
  }

  const hierarchicalCategories = organizeCategories(categories)

  return (
    <div className="product-importer">
      {/* Progress Bar */}
      {loading && progress && (
        <div className="progress-overlay">
          <div className="progress-card">
            <h3>{progress.message || 'İşlem devam ediyor...'}</h3>
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              ></div>
            </div>
            <p>{progress.current} / {progress.total}</p>
            {progress.product && <p className="current-product">{progress.product}</p>}
          </div>
        </div>
      )}

      {/* Step 1: Token Configuration */}
      {step === 1 && (
        <div className="step-container">
          <div className="step-header">
            <h2>Ideasoft API Bağlantısı</h2>
            <p>Token almak için Client ID ve Client Secret girin</p>
          </div>
          
          <ConfigForm 
            config={config}
            onSubmit={handleConfigSubmit}
            onBack={null}
          />
        </div>
      )}

      {/* Step 2: Excel Parse */}
      {step === 2 && (
        <div className="step-container">
          <div className="step-header">
            <h2>Excel Dosyası Yükle ve Parse Et</h2>
            <p>Token başarıyla alındı. Şimdi Excel dosyanızı yükleyin ve parse edin.</p>
          </div>
          <div className="upload-area">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              id="file-upload"
              style={{ display: 'none' }}
            />
            <label htmlFor="file-upload" className="upload-button">
              <span className="upload-icon">📁</span>
              <span>Excel Dosyası Seç</span>
            </label>
            <p className="upload-hint">.xlsx veya .xls formatında dosya yükleyin</p>
          </div>
        </div>
      )}

      {/* Step 3: Gönderme (Import) */}
      {step === 3 && (
        <div className="step-container">
          <div className="step-header">
            <h2>Ürünleri Gönder</h2>
            <p>{products.length} ürün parse edildi ve hazır</p>
          </div>

          {!results ? (
            <div className="import-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', gap: '20px' }}>
                <button onClick={() => setStep(2)} className="btn btn-secondary" style={{ alignSelf: 'flex-start' }}>
                  ← Geri (Yeni Dosya Yükle)
                </button>
                <button onClick={handleImport} className="btn btn-primary" disabled={loading} style={{ alignSelf: 'flex-start' }}>
                  {loading ? 'Aktarılıyor...' : '🚀 Ürünleri Gönder'}
                </button>
              </div>

              <div className="import-summary">
                <h3>Özet</h3>
                <ul>
                  <li>Toplam Ürün: {products.length}</li>
                  <li>Durum: Pasif olarak eklenecek</li>
                  <li>API Key: {config.apiKey.substring(0, 10)}...</li>
                  <li>Shop ID: {config.shopId}</li>
                </ul>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '20px', flexWrap: 'wrap' }}>
                <div className="action-buttons" style={{ flex: '0 0 auto' }}>
                  <button onClick={handleEnrichData} className="btn btn-primary" disabled={loading}>
                    {loading ? 'Zenginleştiriliyor...' : '🔍 Eksik Bilgileri Google\'dan Ara'}
                  </button>
                  {!editAll && (
                    <button 
                      onClick={() => setEditAll(true)} 
                      className="btn btn-primary"
                      disabled={loading}
                    >
                      ✏️ Düzenle
                    </button>
                  )}
                  {editAll && (
                    <>
                      <button 
                        onClick={handleSaveAll} 
                        className="btn btn-success"
                        disabled={loading}
                      >
                        ✓ Tümünü Kaydet
                      </button>
                      <button 
                        onClick={() => setEditAll(false)} 
                        className="btn btn-secondary"
                        disabled={loading}
                      >
                        ✕ İptal
                      </button>
                    </>
                  )}
                  <button 
                    onClick={handleDeleteSelected} 
                    className="btn btn-danger"
                    disabled={loading || selectedProducts.length === 0}
                  >
                    🗑️ Seçilenleri Sil ({selectedProducts.length})
                  </button>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '300px', flex: '1 1 auto', justifyContent: 'flex-end' }}>
                  <label htmlFor="bulk-category-select" style={{ fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>
                    📁 Tüm Ürünlere Kategori:
                  </label>
                  <select
                    id="bulk-category-select"
                    onChange={(e) => {
                      if (e.target.value) {
                        if (e.target.value === '__REMOVE__') {
                          // Kategori kaldırma
                          if (window.confirm(`Tüm ${products.length} ürünün kategorisini kaldırmak istediğinize emin misiniz?`)) {
                            handleBulkCategoryRemove()
                            e.target.value = '' // Select'i sıfırla
                          } else {
                            e.target.value = '' // İptal edilirse select'i sıfırla
                          }
                        } else {
                          // Kategori atama
                          if (window.confirm(`Tüm ${products.length} ürünün kategorisini seçilen kategori olarak güncellemek istediğinize emin misiniz?`)) {
                            handleBulkCategoryAssign(e.target.value)
                            e.target.value = '' // Select'i sıfırla
                          } else {
                            e.target.value = '' // İptal edilirse select'i sıfırla
                          }
                        }
                      }
                    }}
                    className="bulk-category-select"
                    disabled={loading || loadingCategories || categories.length === 0}
                    style={{
                      flex: 1,
                      padding: '10px 40px 10px 12px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '0.95rem',
                      fontFamily: 'inherit',
                      backgroundColor: '#ffffff',
                      cursor: 'pointer',
                      appearance: 'none',
                      backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%23667eea\' d=\'M6 9L1 4h10z\'/%3E%3C/svg%3E")',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 12px center',
                      transition: 'all 0.2s ease',
                      maxWidth: '400px'
                    }}
                  >
                    <option value="">
                      {loadingCategories ? 'Yükleniyor...' : categories.length === 0 ? 'Kategori yok' : 'Kategori Seçin'}
                    </option>
                    <option value="__REMOVE__" style={{ color: '#ef4444', fontWeight: 600 }}>
                      ❌ Kategoriyi Kaldır
                    </option>
                    {renderCategoryOptions(hierarchicalCategories)}
                  </select>
                </div>
              </div>

              {/* Ürünleri göster */}
              <ProductTable 
                ref={productTableRef}
                products={products} 
                onProductUpdate={handleProductUpdate}
                onProductDelete={handleProductDelete}
                editAll={editAll}
                onEditAllChange={setEditAll}
                selectedProducts={selectedProducts}
                onSelectProduct={handleSelectProduct}
                onSelectAll={handleSelectAll}
                categories={categories}
                loadingCategories={loadingCategories}
              />

            </div>
          ) : (
            <div className="results-section">
              <h3>Sonuçlar</h3>
              <div className="results-stats">
                <div className="stat-card success">
                  <h4>Başarılı</h4>
                  <p>{results.success}</p>
                </div>
                <div className="stat-card failed">
                  <h4>Başarısız</h4>
                  <p>{results.failed}</p>
                </div>
                <div className="stat-card total">
                  <h4>Toplam</h4>
                  <p>{results.total}</p>
                </div>
              </div>

              <div className="action-buttons">
                <button onClick={handleReset} className="btn btn-primary">
                  Yeni Aktarım Başlat
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ProductImporter

