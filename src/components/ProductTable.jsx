import { useState, useEffect, useImperativeHandle, forwardRef, useRef } from 'react'
import './ProductTable.css'

const ProductTable = forwardRef(({ products, onProductUpdate, onProductDelete, editAll, onEditAllChange, onSelectAll, onSelectProduct, selectedProducts = [], categories = [], loadingCategories = false }, ref) => {
  const [editingIndex, setEditingIndex] = useState(null)
  const [editedProduct, setEditedProduct] = useState(null)
  const [editedProducts, setEditedProducts] = useState({})
  const editedProductsRef = useRef({})

  const handleEdit = (index) => {
    setEditingIndex(index)
    setEditedProduct({ ...products[index] })
  }

  const handleSave = (index) => {
    if (editedProduct) {
      onProductUpdate(index, editedProduct)
    }
    setEditingIndex(null)
    setEditedProduct(null)
  }

  const handleCancel = () => {
    setEditingIndex(null)
    setEditedProduct(null)
  }

  const handleChange = (field, value) => {
    setEditedProduct({
      ...editedProduct,
      [field]: value
    })
  }

  // EditAll modunda tüm ürünleri düzenlenebilir yap
  useEffect(() => {
    if (editAll) {
      const initialEdited = {}
      products.forEach((product, index) => {
        initialEdited[index] = { ...product }
      })
      setEditedProducts(initialEdited)
      editedProductsRef.current = initialEdited
    } else {
      setEditedProducts({})
      editedProductsRef.current = {}
      setEditingIndex(null)
      setEditedProduct(null)
    }
  }, [editAll, products])

  // editedProducts state'i değiştiğinde ref'i güncelle
  useEffect(() => {
    editedProductsRef.current = editedProducts
  }, [editedProducts])

  const handleDelete = (index) => {
    if (window.confirm('Bu ürünü silmek istediğinize emin misiniz?')) {
      if (onProductDelete) {
        onProductDelete(index)
      }
    }
  }

  const handleChangeAll = (index, field, value) => {
    setEditedProducts(prev => {
      const currentProduct = prev[index] || products[index] || {}
      const updated = {
        ...prev,
        [index]: {
          ...currentProduct,
          [field]: value
        }
      }
      // Ref'i de güncelle
      editedProductsRef.current = updated
      return updated
    })
  }

  const handleSaveAll = () => {
    // Ref'ten güncel editedProducts değerini al (state güncellemeleri asenkron olabilir)
    const currentEdited = editedProductsRef.current
    const editedKeys = Object.keys(currentEdited)
    
    console.log('handleSaveAll çağrıldı, currentEdited:', currentEdited)
    console.log('editedKeys:', editedKeys)
    
    if (editedKeys.length === 0) {
      console.log('Değişiklik yok, edit modu kapatılıyor')
      // Değişiklik yoksa sadece edit modunu kapat
      if (onEditAllChange) {
        onEditAllChange(false)
      }
      return
    }
    
    // Tüm değişiklikleri sırayla kaydet
    editedKeys.forEach(index => {
      const idx = parseInt(index)
      if (onProductUpdate && currentEdited[idx]) {
        console.log(`Ürün güncelleniyor - Index: ${idx}, Product:`, currentEdited[idx])
        // Ref'ten güncel değeri kullan
        onProductUpdate(idx, currentEdited[idx])
      }
    })
    
    // EditAll modunu kapat
    if (onEditAllChange) {
      onEditAllChange(false)
    }
  }

  const handleCancelAll = () => {
    setEditedProducts({})
    if (onEditAllChange) {
      onEditAllChange(false)
    }
  }

  // Parent'tan çağrılabilmesi için
  useImperativeHandle(ref, () => ({
    saveAll: handleSaveAll
  }))

  // Kategorileri hiyerarşik olarak organize et
  const organizeCategories = (categories) => {
    if (!categories || categories.length === 0) return []
    
    // Tüm kategorileri ID'ye göre map'le
    const categoryMap = {}
    const allCategories = categories.map(cat => ({
      ...cat,
      parentId: cat.parentId || (cat.parent ? cat.parent.id : null),
      children: []
    }))
    
    allCategories.forEach(cat => {
      categoryMap[cat.id] = cat
    })
    
    // Root kategorileri (parent'ı olmayanlar) ve child'ları organize et
    const rootCategories = []
    const processed = new Set()
    
    const buildHierarchy = (category) => {
      if (processed.has(category.id)) return null
      processed.add(category.id)
      
      const categoryCopy = { ...category, children: [] }
      
      // Bu kategorinin child'larını bul
      allCategories.forEach(cat => {
        const catParentId = cat.parentId || (cat.parent ? cat.parent.id : null)
        if (catParentId === category.id) {
          const child = buildHierarchy(cat)
          if (child) {
            categoryCopy.children.push(child)
          }
        }
      })
      
      // Child'ları sırala (sortOrder'a göre)
      categoryCopy.children.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      
      return categoryCopy
    }
    
    // Önce root kategorileri bul (parent'ı olmayanlar)
    allCategories.forEach(cat => {
      const catParentId = cat.parentId || (cat.parent ? cat.parent.id : null)
      if (!catParentId) {
        const hierarchy = buildHierarchy(cat)
        if (hierarchy) {
          rootCategories.push(hierarchy)
        }
      }
    })
    
    // Root kategorileri sırala
    rootCategories.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    
    return rootCategories
  }

  // Hiyerarşik kategorileri düzleştirilmiş liste olarak render et
  const renderCategoryOptions = (categoryList, level = 0) => {
    const options = []
    const indent = '  '.repeat(level)
    const prefix = level > 0 ? '└─ ' : ''
    
    categoryList.forEach(category => {
      // Her kategoriyi (hem parent hem child) seçilebilir yap
      options.push(
        <option key={category.id} value={category.id}>
          {indent}{prefix}{category.name}
        </option>
      )
      
      // Alt kategorileri ekle
      if (category.children && category.children.length > 0) {
        options.push(...renderCategoryOptions(category.children, level + 1))
      }
    })
    
    return options
  }

  const hierarchicalCategories = organizeCategories(categories)

  if (products.length === 0) {
    return <div className="no-products">Henüz ürün bulunmuyor.</div>
  }

  return (
    <div className="product-table-container">
      <div className="table-wrapper">
        <table className="product-table">
          <thead>
            <tr>
              <th style={{ width: '50px' }}>
                <input
                  type="checkbox"
                  checked={selectedProducts.length === products.length && products.length > 0}
                  onChange={(e) => {
                    if (onSelectAll) {
                      onSelectAll(e.target.checked)
                    }
                  }}
                />
              </th>
              <th>Ürün Adı</th>
              <th>SKU</th>
              <th>Kategori</th>
              <th>Fiyat</th>
              <th>Stok</th>
              <th>Açıklama</th>
              <th>Resim</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product, index) => {
              const isEditing = editAll ? true : editingIndex === index
              // editAll modunda editedProducts'tan al, yoksa product'tan
              const currentProduct = editAll 
                ? (editedProducts[index] || product)
                : (editingIndex === index ? editedProduct : product)
              
              return (
              <tr key={index}>
                <td style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selectedProducts.includes(index)}
                    onChange={(e) => {
                      e.stopPropagation()
                      if (onSelectProduct) {
                        onSelectProduct(index)
                      }
                    }}
                  />
                </td>
                {isEditing ? (
                  <>
                    <td>
                      <input
                        type="text"
                        value={currentProduct.name || ''}
                        onChange={(e) => editAll ? handleChangeAll(index, 'name', e.target.value) : handleChange('name', e.target.value)}
                        className="table-input"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={currentProduct.sku || ''}
                        onChange={(e) => editAll ? handleChangeAll(index, 'sku', e.target.value) : handleChange('sku', e.target.value)}
                        className="table-input"
                        placeholder="SKU"
                      />
                    </td>
                    <td>
                      <select
                        value={currentProduct.categoryId || currentProduct.category?.id || ''}
                        onChange={(e) => {
                          const categoryId = e.target.value ? parseInt(e.target.value) : null
                          const selectedCategory = categoryId ? categories.find(cat => cat.id === categoryId) : null
                          
                          if (editAll) {
                            // editAll modunda tüm kategori bilgilerini tek seferde güncelle
                            setEditedProducts(prev => {
                              const currentProduct = prev[index] || products[index] || {}
                              const updated = {
                                ...prev,
                                [index]: {
                                  ...currentProduct,
                                  categoryId: categoryId,
                                  category: selectedCategory,
                                  categoryName: selectedCategory?.name || null
                                }
                              }
                              // Ref'i de güncelle
                              editedProductsRef.current = updated
                              console.log(`Kategori güncellendi - Index: ${index}, CategoryId: ${categoryId}, CategoryName: ${selectedCategory?.name}`)
                              return updated
                            })
                          } else {
                            // Tekil düzenleme modunda
                            handleChange('categoryId', categoryId)
                            handleChange('category', selectedCategory)
                            handleChange('categoryName', selectedCategory?.name || null)
                          }
                        }}
                        className="table-input"
                        disabled={loadingCategories}
                        style={{ minWidth: '200px' }}
                      >
                        <option value="">{loadingCategories ? 'Yükleniyor...' : 'Kategori Seçin'}</option>
                        {renderCategoryOptions(hierarchicalCategories)}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        value={currentProduct.price || 0}
                        onChange={(e) => editAll ? handleChangeAll(index, 'price', parseFloat(e.target.value)) : handleChange('price', parseFloat(e.target.value))}
                        className="table-input"
                        step="0.01"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={currentProduct.stock !== undefined ? currentProduct.stock : (currentProduct.stockAmount || 0)}
                        onChange={(e) => editAll ? handleChangeAll(index, 'stock', parseFloat(e.target.value)) : handleChange('stock', parseFloat(e.target.value))}
                        className="table-input"
                        step="0.01"
                      />
                    </td>
                    <td>
                      <textarea
                        value={currentProduct.description || ''}
                        onChange={(e) => editAll ? handleChangeAll(index, 'description', e.target.value) : handleChange('description', e.target.value)}
                        className="table-textarea"
                        rows="3"
                        placeholder="Ürün açıklaması..."
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={currentProduct.image || ''}
                        onChange={(e) => editAll ? handleChangeAll(index, 'image', e.target.value) : handleChange('image', e.target.value)}
                        className="table-input"
                        placeholder="Resim URL'si"
                      />
                      {currentProduct.image && (
                        <img
                          src={currentProduct.image}
                          alt="Önizleme"
                          className="image-preview"
                          onError={(e) => {
                            e.target.style.display = 'none'
                          }}
                        />
                      )}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="product-name-cell">
                      <strong>{product.name || '-'}</strong>
                    </td>
                    <td className="sku-cell">
                      {product.sku || <span className="missing">-</span>}
                    </td>
                    <td className="category-cell">
                      {product.category?.name || product.categoryName || (
                        <span className="missing">-</span>
                      )}
                      {product.category?.parentName && (
                        <span className="parent-category"> ({product.category.parentName})</span>
                      )}
                    </td>
                    <td className="price-cell">
                      {product.price !== undefined && product.price !== null && product.price !== 0 
                        ? <span className="price-value">₺{Number(product.price).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        : <span className="missing">-</span>}
                    </td>
                    <td className="stock-cell">
                      {product.stock !== undefined && product.stock !== null
                        ? <span className="stock-value">{product.stock}</span>
                        : product.stockAmount !== undefined && product.stockAmount !== null
                        ? <span className="stock-value">{product.stockAmount}</span>
                        : <span className="missing">0</span>}
                    </td>
                    <td className="description-cell">
                      {product.description ? (
                        <div className="description-content">
                          <span title={product.description}>
                            {product.description.length > 80
                              ? product.description.substring(0, 80) + '...'
                              : product.description}
                          </span>
                        </div>
                      ) : (
                        <span className="missing">Eksik</span>
                      )}
                    </td>
                    <td className="image-cell">
                      {product.image ? (
                        <div className="image-container">
                          <img
                            src={product.image}
                            alt={product.name}
                            className="product-thumbnail"
                            onError={(e) => {
                              e.target.style.display = 'none'
                              e.target.nextSibling.style.display = 'block'
                            }}
                          />
                          <span className="image-error" style={{ display: 'none' }}>Yüklenemedi</span>
                        </div>
                      ) : (
                        <span className="missing">Eksik</span>
                      )}
                    </td>
                  </>
                )}
              </tr>
            )})}
          </tbody>
        </table>
      </div>
    </div>
  )
})

ProductTable.displayName = 'ProductTable'

export default ProductTable

