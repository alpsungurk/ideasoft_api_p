import { useEffect, useMemo, useState } from 'react';
import { getBatchDetails, updateImportedProduct, updateProductStatus, updateBatchStats } from '../services/databaseService';
import { getIdeasoftProductsBatch, updateIdeasoftProduct, getCategories, getStoredToken, recreateDeletedProduct, postProductDetail, postProductImage, getIdeasoftProduct } from '../services/ideasoftService';
import { normalizeErrorMessage, isDuplicateError } from '../utils/errorHandler';
import './ProjectDetail.css';

const normalizeTextForCompare = (value) => {
  const s = String(value ?? '')
  const withoutHtml = s.replace(/<[^>]*>/g, ' ')
  return withoutHtml.replace(/\s+/g, ' ').trim().toLowerCase()
}

const normalizeImageRefForCompare = (value) => {
  const s = String(value ?? '').trim()
  if (!s) return ''
  const noQuery = s.split('?')[0].split('#')[0]
  const parts = noQuery.split('/')
  const last = parts[parts.length - 1] || noQuery
  return last.trim().toLowerCase()
}

const ProjectDetail = ({ projectId, appConfig, onBack }) => {
  const [loading, setLoading] = useState(true);
  const [batch, setBatch] = useState(null);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [postingId, setPostingId] = useState(null);
  const [pullingId, setPullingId] = useState(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkPosting, setBulkPosting] = useState(false);
  const [bulkPulling, setBulkPulling] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [confirmState, setConfirmState] = useState({ open: false, title: '', message: '', onConfirm: null });
  
  // Notification state
  const [notification, setNotification] = useState({ show: false, message: '', type: 'info' });
  
  const showNotification = (message, type = 'info') => {
    const normalizedMsg = normalizeErrorMessage(message);
    const msgLower = String(normalizedMsg || '').toLowerCase();
    
    // Duplicate hatası veya "aynı üründen var" mesajı ise alert göster
    if (
      isDuplicateError(message) || 
      isDuplicateError(normalizedMsg) ||
      msgLower.includes('aynı üründen var') ||
      msgLower.includes('aynı sku') ||
      msgLower.includes('aynı ürün') ||
      msgLower.includes('duplicate') ||
      msgLower.includes('zaten var')
    ) {
      alert(normalizedMsg || 'Aynı üründen var');
      return;
    }
    
    setNotification({ show: true, message: normalizedMsg, type });
    setTimeout(() => {
      setNotification({ show: false, message: '', type: 'info' });
    }, 3000);
  };

  const title = useMemo(() => {
    if (!batch) return `Proje #${projectId}`;
    return `${batch.name} (#${batch.id})`;
  }, [batch, projectId]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getBatchDetails(projectId);
      if (!result?.success) throw new Error(result?.error || 'Proje detayı alınamadı');
      setBatch(result.data);
      const initialProducts = (result.data?.products || []).map(p => ({
        ...p,
        categoryId:
          p.categoryId ??
          (() => {
            if (p.selected_category_id === null || p.selected_category_id === undefined || p.selected_category_id === '') return null
            const n = Number(p.selected_category_id)
            return Number.isFinite(n) ? n : null
          })(),
        status:
          p.status === undefined || p.status === null
            ? 0
            : ((String(p.transfer_status || '').toUpperCase() === 'PENDING' && !p.last_transfer_date)
              ? 0
              : p.status),
        _dirty: false,
        _remote: null,
        _remoteStatus: p.ideasoft_product_id ? 'unknown' : 'na'
      }));
      setProducts(initialProducts);
      setSelectedProducts(new Set()); // Seçimleri temizle

      const accessToken = appConfig?.apiKey;
      const shopId = appConfig?.shopId;
      const ids = initialProducts.map(p => p.ideasoft_product_id).filter(Boolean);
      if (accessToken && shopId && ids.length > 0) {
        setPullingId('all');
        const remoteResult = await getIdeasoftProductsBatch({ shopId, accessToken, productIds: ids });
        if (remoteResult?.success) {
          const map = remoteResult?.data?.results || {};
          setProducts(prev => prev.map(p => {
            const key = String(p.ideasoft_product_id || '').trim();
            const r = key ? map[key] : null;
            const data = r?.success ? r.data : null;
            const status = p.ideasoft_product_id
              ? (data ? 'found' : 'missing')
              : 'na';
            return { ...p, _remote: data, _remoteStatus: status };
          }));
        }
        setPullingId(null);
      }
      
      // Load categories
      if (accessToken && shopId) {
        await loadCategories(accessToken, shopId);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  
  const loadCategories = async (accessToken, shopId) => {
    setLoadingCategories(true);
    try {
      const result = await getCategories(accessToken, shopId);
      if (result.success) {
        setCategories(result.data);
      }
    } catch (error) {
    } finally {
      setLoadingCategories(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const setField = (rowId, field, value) => {
    setProducts(prev => prev.map(p =>
      p.id !== rowId ? p : { ...p, [field]: value, _dirty: true }
    ));
  };

  const handleSaveRow = async (row) => {
    setSavingId(row.id);
    try {
      const payload = {
        name: row.name ?? '',
        sku: row.sku ?? '',
        price: Number(row.price) || 0,
        stockAmount: Number(row.stock_amount) || 0,
        description: row.description ?? '',
        imageUrl: row.image_url ?? '',
        status: Number(row.status) ? 1 : 0,
        categoryId: row.categoryId
      };
      const result = await updateImportedProduct(row.id, payload);
      if (!result?.success) throw new Error(result?.error || 'Kaydedilemedi');

      setProducts(prev => prev.map(p =>
        p.id === row.id
          ? {
            ...p,
            _dirty: false,
            _remote: p._remote ? {
              ...p._remote,
              name: p.name,
              sku: p.sku,
              price1: p.price,
              stockAmount: p.stock_amount,
              status: p.status,
              details: p.description
            } : null
          }
          : p
      ));
      
      showNotification('Ürün başarıyla veritabanına kaydedildi.', 'success');
    } catch (e) {
      showNotification('Kaydetme hatası: ' + e.message, 'error');
    } finally {
      setSavingId(null);
    }
  };

  const handlePullRow = async (row) => {
    if (!row.ideasoft_product_id) {
      showNotification('Ideasoft ürün ID\'si bulunamadı.', 'error');
      return;
    }

    setPullingId(row.id);
    try {
      const accessToken = appConfig?.apiKey;
      const shopId = appConfig?.shopId;

      if (!accessToken || !shopId) {
        showNotification('Shop ID veya Access Token eksik!', 'error');
        return;
      }

      // Ideasoft API'den tam ürün bilgisini çek
      const productResult = await getIdeasoftProduct({
        shopId,
        accessToken,
        productId: row.ideasoft_product_id
      });

      if (!productResult?.success || !productResult?.data) {
        throw new Error(productResult?.error || 'Ürün bilgisi alınamadı');
      }

      const productData = productResult.data;
      
      // Ürün detaylarını çek (details, extraDetails)
      let details = '';
      let extraDetails = '';
      if (productData.detail) {
        details = String(productData.detail.details || '').trim();
        extraDetails = String(productData.detail.extraDetails || '').trim();
      }

      // Resimleri çek (ilk resim)
      let imageUrl = '';
      if (productData.images && Array.isArray(productData.images) && productData.images.length > 0) {
        const firstImage = productData.images[0];
        imageUrl = String(firstImage.originalUrl || firstImage.thumbUrl || firstImage.filename || '').trim();
      }

      // Kategori bilgisini çek (ilk kategori)
      let categoryId = null;
      if (productData.categories && Array.isArray(productData.categories) && productData.categories.length > 0) {
        categoryId = Number(productData.categories[0].id) || null;
      }

      // Fiyat bilgisini çek
      const price = Number(productData.price1 || productData.price || 0);

      // Stok bilgisini çek
      const stockAmount = Number(productData.stockAmount || productData.stock || 0);

      // Status bilgisini çek
      const status = Number(productData.status) === 1 ? 1 : 0;

      // Tüm verileri payload'a ekle
      const payload = {
        name: String(productData.name || '').trim(),
        sku: String(productData.sku || '').trim(),
        price: price,
        stockAmount: stockAmount,
        description: details || extraDetails || '',
        imageUrl: imageUrl,
        status: status,
        categoryId: categoryId
      };

      const result = await updateImportedProduct(row.id, payload);
      if (!result?.success) throw new Error(result?.error || 'Veri çekilemedi');

      setProducts(prev => prev.map(p =>
        p.id === row.id
          ? {
              ...p,
              ...payload,
              stock_amount: payload.stockAmount,
              image_url: payload.imageUrl,
              _dirty: false
            }
          : p
      ));
      
      showNotification('Ürün Ideasoft verileriyle başarıyla güncellendi.', 'success');
    } catch (e) {
      showNotification('Veri çekme hatası: ' + e.message, 'error');
    } finally {
      setPullingId(null);
    }
  };

  const handleBulkSave = async () => {
    // Sadece seçili ürünleri al
    const selectedIds = Array.from(selectedProducts);
    if (selectedIds.length === 0) {
      showNotification('Lütfen kaydetmek istediğiniz ürünleri seçin.', 'warning');
      return;
    }
    
    const dirtyProducts = products.filter(p => selectedIds.includes(p.id) && p._dirty);
    if (dirtyProducts.length === 0) {
      showNotification('Seçili ürünlerde kaydedilecek değişiklik yok.', 'warning');
      return;
    }
  
    setBulkSaving(true);
    let successCount = 0;
    for (const p of dirtyProducts) {
      try {
        const payload = {
          name: p.name ?? '',
          sku: p.sku ?? '',
          price: Number(p.price) || 0,
          stockAmount: Number(p.stock_amount) || 0,
          description: p.description ?? '',
          imageUrl: p.image_url ?? '',
          status: Number(p.status) ? 1 : 0,
          categoryId: p.categoryId
        };
        await updateImportedProduct(p.id, payload);
        successCount++; 
      } catch (e) {
      }
    }
  
    // Refresh to sync everything
    await load();
    showNotification(`${successCount} ürün başarıyla veritabanına kaydedildi.`, 'success');
    setBulkSaving(false);
  };

  const handleBulkUpdateIdeasoft = async () => {
    // Sadece seçili ürünleri al
    const selectedIds = Array.from(selectedProducts);
    if (selectedIds.length === 0) {
      showNotification('Lütfen göndermek istediğiniz ürünleri seçin.', 'warning');
      return;
    }
    
    // Seçili ürünleri al - ideasoft_product_id olanlar veya başarısız durumdaki ürünler
    const targetProducts = products.filter(p => {
      if (!selectedIds.includes(p.id)) return false;
      const isFailed = String(p.transfer_status || '').toUpperCase() === 'FAILED';
      // ideasoft_product_id olanlar veya başarısız durumdaki ürünler (ideasoft_product_id olsa da olmasa da)
      return p.ideasoft_product_id || isFailed;
    });
    const selectedCount = selectedIds.length;
    
    if (targetProducts.length === 0) {
      showNotification('Seçili ürünlerde Ideasoft\'a gönderilecek ürün bulunamadı.', 'warning');
      return;
    }

    setConfirmState({
      open: true,
      title: 'Onay',
      message: `${selectedCount} ürün seçildi. ${targetProducts.length} ürünü Ideasoft'a göndermek istediğinize emin misiniz?`,
      onConfirm: async () => {
        setConfirmState({ open: false, title: '', message: '', onConfirm: null });
        setBulkPosting(true);
        const { apiKey, shopId } = appConfig;
        let successCount = 0;
        let deletedCount = 0;
        let recreatedCount = 0;

        // Her ürün için işlemi paralel olarak çalıştır
        const processProduct = async (p) => {
          const result = { success: false, recreated: false, deleted: false, error: null };
          try {
            // Başarısız durumdaki ürünler için de göndermeye çalış
            const isFailed = String(p.transfer_status || '').toUpperCase() === 'FAILED';
            
            const productData = {
              name: p.name || '',
              fullName: p.name || '',
              sku: p.sku || '',
              price1: Number(p.price) || 0,
              stockAmount: Number(p.stock_amount) || 0,
              status: Number(p.status) ? 1 : 0,
              details: p.description || '',
            };
            
            // Başarısız durumdaki ürünler için de göndermeye çalış
            let result = null;
            
            // Eğer ideasoft_product_id yoksa, önce oluştur
            if (!p.ideasoft_product_id) {
              const createRes = await recreateDeletedProduct(productData, apiKey, shopId);
              if (createRes?.success && createRes?.data?.id) {
                const newIdeasoftId = createRes.data.id;
                await updateImportedProduct(p.id, {
                  ...productData,
                  ideasoft_product_id: newIdeasoftId
                });
                p.ideasoft_product_id = newIdeasoftId;
                
                // Detail ve image gönder
                if (String(p.description || '').trim()) {
                  try {
                    await postProductDetail({
                      shopId,
                      accessToken: apiKey,
                      localProductId: p.id,
                      details: p.description || '',
                      extraDetails: ''
                    });
                  } catch (e) {
                  }
                }
                
                if (String(p.image_url || '').trim()) {
                  try {
                    await postProductImage({
                      shopId,
                      accessToken: apiKey,
                      localProductId: p.id,
                      imageUrl: p.image_url,
                      ideasoftProductId: newIdeasoftId
                    });
                  } catch (e) {
                  }
                }
                
                // Başarılı oldu, durumu SUCCESS olarak güncelle
                await updateProductStatus(p.sku, newIdeasoftId, 'SUCCESS', null);
                successCount++;
                recreatedCount++;
                setProducts(prev => prev.map(prod =>
                  prod.id === p.id
                    ? { ...prod, ideasoft_product_id: newIdeasoftId, _remote: createRes.data, _remoteStatus: 'found', _dirty: false }
                    : prod
                ));
                return result; // Bu ürün için işlem tamamlandı
              } else {
                // ideasoft_product_id yoksa updateProductStatus çağrılamaz, sadece logla
                result.error = normalizeErrorMessage(createRes?.error || 'Ürün oluşturulamadı');
                // Duplicate hatası ise modal göster
                if (isDuplicateError(createRes?.error) || isDuplicateError(result.error)) {
                  showNotification(result.error, 'error');
                }
                return result; // Bu ürün için işlem başarısız
              }
            }
            
            if (isFailed && p.ideasoft_product_id) {
              // Başarısız olanlar için önce update dene
              result = await updateIdeasoftProduct({
                shopId,
                accessToken: apiKey,
                productId: p.ideasoft_product_id,
                productData
              });
              
              // Eğer update başarılı olduysa, detail ve image gönder ve durumu SUCCESS yap
              if (result?.success) {
                // Detail gönder
                if (String(p.description || '').trim()) {
                  try {
                    await postProductDetail({
                      shopId,
                      accessToken: apiKey,
                      localProductId: p.id,
                      details: p.description || '',
                      extraDetails: ''
                    });
                  } catch (e) {
                  }
                }
                
                // Image gönder
                if (String(p.image_url || '').trim()) {
                  try {
                    await postProductImage({
                      shopId,
                      accessToken: apiKey,
                      localProductId: p.id,
                      imageUrl: p.image_url,
                      ideasoftProductId: p.ideasoft_product_id
                    });
                  } catch (e) {
                  }
                }
                
                // Başarılı oldu, durumu SUCCESS olarak güncelle
                await updateProductStatus(p.sku, p.ideasoft_product_id, 'SUCCESS', null);
                result.success = true;
                setProducts(prev => prev.map(prod =>
                  prod.id === p.id ? { ...prod, _remote: result.data, _remoteStatus: 'found', _dirty: false } : prod
                ));
                return result; // Bu ürün için işlem tamamlandı
              } else {
                // Eğer update başarısız olduysa, recreate dene
                const recreate = await recreateDeletedProduct(productData, apiKey, shopId);
                if (recreate?.success && recreate?.data?.id) {
                  const newIdeasoftId = recreate.data.id;
                  result = { success: true, data: recreate.data };
                  
                  await updateImportedProduct(p.id, {
                    name: p.name,
                    sku: p.sku,
                    price: Number(p.price),
                    stockAmount: Number(p.stock_amount),
                    description: p.description,
                    imageUrl: p.image_url,
                    status: Number(p.status),
                    categoryId: p.categoryId,
                    ideasoft_product_id: newIdeasoftId
                  });
                  
                  // Detail ve image gönder
                  if (String(p.description || '').trim()) {
                    try {
                      await postProductDetail({
                        shopId,
                        accessToken: apiKey,
                        localProductId: p.id,
                        details: p.description || '',
                        extraDetails: ''
                      });
                    } catch (e) {
                    }
                  }
                  
                  if (String(p.image_url || '').trim()) {
                    try {
                      await postProductImage({
                        shopId,
                        accessToken: apiKey,
                        localProductId: p.id,
                        imageUrl: p.image_url,
                        ideasoftProductId: newIdeasoftId
                      });
                    } catch (e) {
                    }
                  }
                  
                  // Başarılı oldu, durumu SUCCESS olarak güncelle
                  await updateProductStatus(p.sku, newIdeasoftId, 'SUCCESS', null);
                  result.success = true;
                  result.recreated = true;
                  setProducts(prev => prev.map(prod =>
                    prod.id === p.id
                      ? { ...prod, ideasoft_product_id: newIdeasoftId, _remote: recreate.data, _remoteStatus: 'found', _dirty: false }
                      : prod
                  ));
                  return result; // Bu ürün için işlem tamamlandı
                } else {
                  // Recreate de başarısız oldu
                  result.error = normalizeErrorMessage(recreate?.error || 'Ürün yeniden oluşturulamadı');
                  await updateProductStatus(p.sku, p.ideasoft_product_id || newIdeasoftId, 'FAILED', result.error);
                  // Duplicate hatası ise modal göster
                  if (isDuplicateError(recreate?.error) || isDuplicateError(result.error)) {
                    showNotification(result.error, 'error');
                  }
                  return result;
                }
              }
            } else {
              // Normal update
              result = await updateIdeasoftProduct({
                shopId,
                accessToken: apiKey,
                productId: p.ideasoft_product_id,
                productData
              });
            }

            const is404 = !result?.success && (
              result?.code === 404 ||
              result?.statusCode === 404 ||
              (result?.error && String(result.error).toLowerCase().includes('not found'))
            );

            if (is404) {
              result.deleted = true;
              const recreate = await recreateDeletedProduct(productData, apiKey, shopId);
              if (recreate?.success && recreate?.data?.id) {
                await updateProductStatus(p.sku, recreate.data.id, 'SUCCESS', null);
                const updatedPayload = {
                  name: p.name,
                  sku: p.sku,
                  price: Number(p.price),
                  stockAmount: Number(p.stock_amount),
                  description: p.description,
                  imageUrl: p.image_url,
                  status: Number(p.status),
                  categoryId: p.categoryId,
                  ideasoft_product_id: recreate.data.id
                };
                await updateImportedProduct(p.id, updatedPayload);

                if (String(p.description || '').trim()) {
                  await postProductDetail({
                    shopId,
                    accessToken: apiKey,
                    localProductId: p.id,
                    details: p.description || '',
                    extraDetails: ''
                  });
                }
                if (String(p.image_url || '').trim()) {
                  await postProductImage({
                    shopId,
                    accessToken: apiKey,
                    localProductId: p.id,
                    imageUrl: p.image_url,
                    ideasoftProductId: recreate.data.id
                  });
                }

                result.success = true;
                result.recreated = true;
                setProducts(prev => prev.map(prod =>
                  prod.id === p.id
                    ? { ...prod, ideasoft_product_id: recreate.data.id, _remote: recreate.data, _remoteStatus: 'found', _dirty: false }
                    : prod
                ));
                return result;
              } else {
                result.error = recreate?.error || 'Ürün yeniden oluşturulamadı';
                await updateProductStatus(p.sku, p.ideasoft_product_id, 'FAILED', result.error);
                setProducts(prev => prev.map(prod =>
                  prod.id === p.id ? { ...prod, _remote: null, _remoteStatus: 'missing' } : prod
                ));
                return result;
              }
            } else if (result?.success) {
              await updateProductStatus(p.sku, p.ideasoft_product_id, 'SUCCESS', null);

              if (String(p.description || '').trim()) {
                try {
                  await postProductDetail({
                    shopId,
                    accessToken: apiKey,
                    localProductId: p.id,
                    details: p.description || '',
                    extraDetails: ''
                  });
                } catch (e) {
                  console.error('ProductDetail gönderme hatası:', e);
                }
              }
              if (String(p.image_url || '').trim()) {
                try {
                  await postProductImage({
                    shopId,
                    accessToken: apiKey,
                    localProductId: p.id,
                    imageUrl: p.image_url,
                    ideasoftProductId: p.ideasoft_product_id
                  });
                } catch (e) {
                  console.error('ProductImage gönderme hatası:', e);
                }
              }

              result.success = true;
              // UI'ı güncelle
              setProducts(prev => prev.map(prod =>
                prod.id === p.id ? { ...prod, _remote: result.data, _remoteStatus: 'found', _dirty: false } : prod
              ));
              return result;
            } else {
              result.error = result?.error || 'Ideasoft güncellenemedi';
              await updateProductStatus(p.sku, p.ideasoft_product_id, 'FAILED', result.error);
              return result;
            }
          } catch (e) {
            const errorMsg = normalizeErrorMessage(e?.message || 'Ideasoft gönderim hatası')
            result.error = errorMsg;
            if (p.ideasoft_product_id) {
              await updateProductStatus(p.sku, p.ideasoft_product_id, 'FAILED', errorMsg);
            }
            return result;
          }
        };

        // Tüm ürünleri paralel olarak işle (Promise.allSettled ile)
        const results = await Promise.allSettled(targetProducts.map(p => processProduct(p)));
        
        // Sonuçları topla ve başarısız ürünleri belirle
        const failedProducts = [];
        results.forEach((settledResult, index) => {
          const product = targetProducts[index];
          const productName = product?.name || product?.sku || `Ürün #${index + 1}`;
          
          if (settledResult.status === 'fulfilled') {
            const r = settledResult.value;
            if (r.success) {
              successCount++;
              if (r.recreated) recreatedCount++;
              if (r.deleted) deletedCount++;
            } else if (r.error) {
              const errorMsg = normalizeErrorMessage(r.error);
              if (isDuplicateError(r.error) || isDuplicateError(errorMsg)) {
                failedProducts.push({
                  name: productName,
                  sku: product?.sku || '',
                  error: 'Aynı üründen var'
                });
              } else {
                failedProducts.push({
                  name: productName,
                  sku: product?.sku || '',
                  error: errorMsg
                });
              }
            }
          } else {
            const error = settledResult.reason;
            const errorMsg = normalizeErrorMessage(error);
            if (isDuplicateError(error) || isDuplicateError(errorMsg)) {
              failedProducts.push({
                name: productName,
                sku: product?.sku || '',
                error: 'Aynı üründen var'
              });
            } else {
              failedProducts.push({
                name: productName,
                sku: product?.sku || '',
                error: errorMsg
              });
            }
          }
        });
        
        // Başarısız ürünleri modal olarak göster
        if (failedProducts.length > 0) {
          const duplicateProducts = failedProducts.filter(p => p.error === 'Aynı üründen var');
          let modalMessage = `❌ ${failedProducts.length} ürün başarısız oldu!\n\n`;
          
          if (duplicateProducts.length > 0) {
            const productList = duplicateProducts.map(p => `- ${p.name}${p.sku ? ` (SKU: ${p.sku})` : ''}`).join('\n');
            modalMessage += `Aynı üründen var:\n${productList}`;
          }
          
          // Diğer hatalar varsa onları da göster
          const otherErrors = failedProducts.filter(p => p.error !== 'Aynı üründen var');
          if (otherErrors.length > 0) {
            if (duplicateProducts.length > 0) modalMessage += '\n\n';
            const errorList = otherErrors.map(p => `- ${p.name}${p.sku ? ` (SKU: ${p.sku})` : ''}: ${p.error}`).join('\n');
            modalMessage += `Başarısız ürünler:\n${errorList}`;
          }
          
          if (modalMessage) {
            setConfirmState({
              open: true,
              title: '❌ Aktarım Başarısız',
              message: modalMessage,
              onConfirm: null // Sadece "Tamam" butonu göster
            });
          }
        }

        try {
          if (batch?.id) await updateBatchStats(batch.id);
        } catch {
          // ignore
        }

        await load();

        if (recreatedCount > 0) {
          showNotification(`${successCount} ürün işlendi. ${recreatedCount} ürün yeniden yüklendi.`, 'success');
        } else if (deletedCount > 0 && successCount > 0) {
          showNotification(`${successCount} ürün Ideasoft'ta güncellendi. ${deletedCount} ürün Ideasoft'tan silinmişti.`, 'info');
        } else if (deletedCount > 0) {
          showNotification(`${deletedCount} ürün Ideasoft'tan silinmiş. Hiçbir ürün gönderilemedi.`, 'warning');
        } else {
          showNotification(`${successCount} ürün Ideasoft'ta güncellendi.`, 'success');
        }

        setBulkPosting(false);
      }
    });

    return;

  };

  const handleBulkPullFromIdeasoft = async () => {
    // Sadece seçili ürünleri al
    const selectedIds = Array.from(selectedProducts);
    if (selectedIds.length === 0) {
      showNotification('Lütfen çekmek istediğiniz ürünleri seçin.', 'warning');
      return;
    }
    
    const targetProducts = products.filter(p => selectedIds.includes(p.id) && p.ideasoft_product_id);
    const selectedCount = selectedIds.length;
    
    if (targetProducts.length === 0) {
      showNotification('Seçili ürünlerde Ideasoft ürün ID\'si bulunamadı.', 'warning');
      return;
    }

    setConfirmState({
      open: true,
      title: 'Onay',
      message: `${selectedCount} ürün seçildi. ${targetProducts.length} ürünü Ideasoft verileriyle güncellemek (DB'ye kaydetmek) istediğinize emin misiniz? Yerel değişiklikleriniz kaybolabilir.`,
      onConfirm: async () => {
        setConfirmState({ open: false, title: '', message: '', onConfirm: null });
        setBulkPulling(true);
        let successCount = 0;
        let errorCount = 0;

        const accessToken = appConfig?.apiKey;
        const shopId = appConfig?.shopId;

        if (!accessToken || !shopId) {
          showNotification('Shop ID veya Access Token eksik!', 'error');
          setBulkPulling(false);
          return;
        }

        for (const p of targetProducts) {
          try {
            // Ideasoft API'den tam ürün bilgisini çek
            const productResult = await getIdeasoftProduct({
              shopId,
              accessToken,
              productId: p.ideasoft_product_id
            });

            if (!productResult?.success || !productResult?.data) {
              errorCount++;
              continue;
            }

            const productData = productResult.data;
            
            // Ürün detaylarını çek (details, extraDetails)
            let details = '';
            let extraDetails = '';
            if (productData.detail) {
              details = String(productData.detail.details || '').trim();
              extraDetails = String(productData.detail.extraDetails || '').trim();
            }

            // Resimleri çek (ilk resim)
            let imageUrl = '';
            if (productData.images && Array.isArray(productData.images) && productData.images.length > 0) {
              const firstImage = productData.images[0];
              imageUrl = String(firstImage.originalUrl || firstImage.thumbUrl || firstImage.filename || '').trim();
            }

            // Kategori bilgisini çek (ilk kategori)
            let categoryId = null;
            if (productData.categories && Array.isArray(productData.categories) && productData.categories.length > 0) {
              categoryId = Number(productData.categories[0].id) || null;
            }

            // Fiyat bilgisini çek
            const price = Number(productData.price1 || productData.price || 0);

            // Stok bilgisini çek
            const stockAmount = Number(productData.stockAmount || productData.stock || 0);

            // Status bilgisini çek
            const status = Number(productData.status) === 1 ? 1 : 0;

            // Tüm verileri payload'a ekle
            const payload = {
              name: String(productData.name || '').trim(),
              sku: String(productData.sku || '').trim(),
              price: price,
              stockAmount: stockAmount,
              description: details || extraDetails || '',
              imageUrl: imageUrl,
              status: status,
              categoryId: categoryId
            };

            await updateImportedProduct(p.id, payload);
            successCount++;
          } catch (e) {
            errorCount++;
          }
        }

        await load();
        if (errorCount > 0) {
          showNotification(`${successCount} ürün başarıyla çekildi, ${errorCount} ürün çekilemedi.`, 'warning');
        } else {
          showNotification(`${successCount} ürün Ideasoft verileriyle senkronize edildi (DB güncellendi).`, 'success');
        }
        setBulkPulling(false);
      }
    });
  };

  const handleUpdateIdeasoftProduct = async (row) => {
    setPostingId(row.id);
    try {
      const { apiKey, shopId } = appConfig;
      if (!apiKey || !shopId) throw new Error('ShopId veya access token yok');
      if (!row.ideasoft_product_id) throw new Error('Ürün Ideasoft ID\'sine sahip değil');
  
      const productData = {
        name: row.name || '',
        fullName: row.name || '',
        sku: row.sku || '',
        price1: Number(row.price) || 0,
        stockAmount: Number(row.stock_amount) || 0,
        status: Number(row.status) ? 1 : 0,
        details: row.description || '',
        categoryId: row.categoryId
      };
  
      const result = await updateIdeasoftProduct({
        shopId,
        accessToken: apiKey,
        productId: row.ideasoft_product_id,
        productData
      });
  
      if (!result?.success) {
        // Check if the error is a 404 (product not found)
        if (result?.code === 404 || (result?.error && result?.error?.includes('not found'))) {
          showNotification('Ürün Ideasoft\'tan silinmiş. Bu ürünü Ideasoft\'a gönderemezsiniz.', 'error');
          // Update the product to show it's been deleted
          setProducts(prev => prev.map(p =>
            p.id === row.id ? { ...p, _remote: null } : p
          ));
          return; // Exit early since product doesn't exist
        } else {
          throw new Error(result?.error || 'Ideasoft güncellenemedi');
        }
      } else {
        setProducts(prev => prev.map(p =>
          p.id !== row.id ? p : { ...p, _remote: result.data, _dirty: false }
        ));

        // Product Detail ve Image gönderimini bağımsız olarak dene (birisi başarısız olsa bile diğeri denensin)
        const errors = [];
        
        if (String(row.description || '').trim()) {
          try {
            const dRes = await postProductDetail({
              shopId,
              accessToken: apiKey,
              localProductId: row.id,
              details: row.description || '',
              extraDetails: ''
            });
            if (!dRes?.success) {
              const errorMsg = normalizeErrorMessage(dRes?.error || 'Gönderilemedi')
              errors.push(`Açıklama: ${errorMsg}`);
              // Duplicate hatası ise modal göster
              if (isDuplicateError(dRes?.error) || dRes?.duplicate) {
                showNotification(errorMsg, 'error');
              }
            } else {
              if (dRes?.duplicate) {
                showNotification('Aynı üründen var', 'error');
              } else {
              }
            }
          } catch (e) {
            const errorMsg = normalizeErrorMessage(e.message || 'Gönderilemedi')
            errors.push(`Açıklama: ${errorMsg}`);
          }
        }
        
        if (String(row.image_url || '').trim()) {
          try {
            const iRes = await postProductImage({
              shopId,
              accessToken: apiKey,
              localProductId: row.id,
              imageUrl: row.image_url,
              ideasoftProductId: row.ideasoft_product_id
            });
            if (!iRes?.success) {
              const errorMsg = normalizeErrorMessage(iRes?.error || 'Gönderilemedi')
              errors.push(`Resim: ${errorMsg}`);
              // Duplicate hatası ise modal göster
              if (isDuplicateError(iRes?.error) || iRes?.duplicate) {
                showNotification(errorMsg, 'error');
              }
            } else {
              if (iRes?.duplicate) {
                showNotification('Aynı üründen var', 'error');
              } else {
              }
            }
          } catch (e) {
            const errorMsg = normalizeErrorMessage(e.message || 'Gönderilemedi')
            errors.push(`Resim: ${errorMsg}`);
          }
        }
        
        // Eğer her iki işlem de başarısız olduysa hata fırlat
        if (errors.length > 0 && (!String(row.description || '').trim() || !String(row.image_url || '').trim())) {
          // Eğer sadece bir işlem varsa ve başarısız olduysa hata fırlat
          throw new Error(errors.join('; '));
        } else if (errors.length > 0) {
          // Her iki işlem de denenmişse ama başarısız olmuşsa hata fırlat
          // Yine de devam et, sadece uyarı ver
        }

        await updateProductStatus(row.sku, row.ideasoft_product_id, 'SUCCESS', null);
        if (batch?.id) await updateBatchStats(batch.id);
        showNotification('Ideasoft ürünü başarıyla güncellendi.', 'success');
      }
    } catch (e) {
      try {
        const errorMsg = normalizeErrorMessage(e?.message || 'Ideasoft güncelleme hatası')
        await updateProductStatus(row.sku, row.ideasoft_product_id, 'FAILED', errorMsg);
        if (batch?.id) await updateBatchStats(batch.id);
      } catch {
        // ignore
      }
      const errorMsg = normalizeErrorMessage(e.message)
      showNotification('Ideasoft güncelleme hatası: ' + errorMsg, 'error');
    } finally {
      setPostingId(null);
    }
  };
  
  const handleRecreateDeletedProduct = async (row) => {
    setPostingId(row.id);
    try {
      const { apiKey, shopId } = appConfig;
      if (!apiKey || !shopId) throw new Error('ShopId veya access token yok');
      
      // Prepare product data for recreation
      const productData = {
        name: row.name || '',
        fullName: row.name || '',
        sku: row.sku || '',
        price1: Number(row.price) || 0,
        stockAmount: Number(row.stock_amount) || 0,
        status: Number(row.status) ? 1 : 0,
      };
  
      const result = await recreateDeletedProduct(productData, apiKey, shopId);
  
      if (!result?.success) {
        const errorMsg = normalizeErrorMessage(result?.error || 'Ürün yeniden oluşturulamadı');
        // Duplicate hatası ise modal göster
        if (isDuplicateError(result?.error) || isDuplicateError(errorMsg)) {
          showNotification(errorMsg, 'error');
        }
        throw new Error(errorMsg);
      }
      
      // Update the database with the new Ideasoft product ID
      const updatedPayload = {
        name: row.name,
        sku: row.sku,
        price: Number(row.price),
        stockAmount: Number(row.stock_amount),
        description: row.description,
        imageUrl: row.image_url,
        status: Number(row.status),
        categoryId: row.categoryId,
        ideasoft_product_id: result.data.id  // Update with new product ID
      };
      
      await updateImportedProduct(row.id, updatedPayload);
      
      const newIdeasoftId = result.data.id;
      
      // Send product detail if available
      if (String(row.description || '').trim()) {
        try {
          const dRes = await postProductDetail({
            shopId,
            accessToken: apiKey,
            localProductId: row.id,
            details: row.description || '',
            extraDetails: ''
          });
          if (!dRes?.success) {
          }
        } catch (e) {
          console.error('ProductDetail gönderme hatası:', e);
        }
      }
      
      // Send product image if available
      if (String(row.image_url || '').trim()) {
        try {
          const iRes = await postProductImage({
            shopId,
            accessToken: apiKey,
            localProductId: row.id,
            imageUrl: row.image_url,
            ideasoftProductId: newIdeasoftId
          });
          if (!iRes?.success) {
          }
        } catch (e) {
          console.error('ProductImage gönderme hatası:', e);
        }
      }
      
      // Update product status
      await updateProductStatus(row.sku, newIdeasoftId, 'SUCCESS', null);
      if (batch?.id) await updateBatchStats(batch.id);
      
      // Reload data to get fresh state
      await load();
      
      showNotification('Ürün Ideasoft\'a başarıyla yeniden yüklendi (detay + resim gönderildi).', 'success');
    } catch (e) {
      showNotification('Yeniden yükleme hatası: ' + e.message, 'error');
    } finally {
      setPostingId(null);
    }
  };

  const handleRetryPostProduct = async (row) => {
    setPostingId(row.id);
    try {
      const { apiKey, shopId } = appConfig;
      if (!apiKey || !shopId) throw new Error('ShopId veya access token yok');

      const imageUrl = row.image_url || '';
      const description = row.description || '';

      // Ensure product exists in Ideasoft (create if missing / failed)
      let ensuredIdeasoftId = row.ideasoft_product_id;

      // If we have an id, try update first (may be 404)
      if (ensuredIdeasoftId) {
        const productData = {
          name: row.name || '',
          fullName: row.name || '',
          sku: row.sku || '',
          price1: Number(row.price) || 0,
          stockAmount: Number(row.stock_amount) || 0,
          status: Number(row.status) ? 1 : 0,
          details: row.description || '',
          categoryId: row.categoryId
        };

        const updateRes = await updateIdeasoftProduct({
          shopId,
          accessToken: apiKey,
          productId: ensuredIdeasoftId,
          productData
        });

        const is404 = !updateRes?.success && (
          updateRes?.code === 404 ||
          updateRes?.statusCode === 404 ||
          (updateRes?.error && String(updateRes.error).toLowerCase().includes('not found'))
        );

        if (is404) {
          ensuredIdeasoftId = null;
        } else if (!updateRes?.success) {
          throw new Error(updateRes?.error || 'Ideasoft güncellenemedi');
        } else {
          setProducts(prev => prev.map(p =>
            p.id !== row.id ? p : { ...p, _remote: updateRes.data, _remoteStatus: 'found', _dirty: false }
          ));
        }
      }

      // Create/recreate if missing
      if (!ensuredIdeasoftId) {
        const productData = {
          name: row.name || '',
          fullName: row.name || '',
          sku: row.sku || '',
          price1: Number(row.price) || 0,
          stockAmount: Number(row.stock_amount) || 0,
          status: Number(row.status) ? 1 : 0,
        };
        const createRes = await recreateDeletedProduct(productData, apiKey, shopId);
        if (!createRes?.success || !createRes?.data?.id) {
          const errorMsg = normalizeErrorMessage(createRes?.error || 'Ürün Ideasoft\'a gönderilemedi');
          // Duplicate hatası ise modal göster
          if (isDuplicateError(createRes?.error) || isDuplicateError(errorMsg)) {
            showNotification(errorMsg, 'error');
          }
          throw new Error(errorMsg);
        }

        ensuredIdeasoftId = createRes.data.id;

        await updateProductStatus(row.sku, ensuredIdeasoftId, 'SUCCESS', null);

        await updateImportedProduct(row.id, {
          ideasoft_product_id: ensuredIdeasoftId
        });

        setProducts(prev => prev.map(p =>
          p.id !== row.id
            ? p
            : { ...p, ideasoft_product_id: ensuredIdeasoftId, _remote: createRes.data, _remoteStatus: 'found', _dirty: false }
        ));
      }

      // Push details
      if (String(description || '').trim()) {
        const dRes = await postProductDetail({
          shopId,
          accessToken: apiKey,
          localProductId: row.id,
          details: description,
          extraDetails: ''
        });
        if (!dRes?.success) {
          throw new Error(dRes?.error || 'Açıklama gönderilemedi');
        }
      }

      // Push image
      if (String(imageUrl || '').trim()) {
        const iRes = await postProductImage({
          shopId,
          accessToken: apiKey,
          localProductId: row.id,
          imageUrl,
          ideasoftProductId: ensuredIdeasoftId
        });
        if (!iRes?.success) {
          throw new Error(iRes?.error || 'Resim gönderilemedi');
        }
      }

      await updateProductStatus(row.sku, ensuredIdeasoftId, 'SUCCESS', null);
      if (batch?.id) await updateBatchStats(batch.id);

      showNotification('Ürün tekrar gönderildi (detay + resim).', 'success');
      await load();
    } catch (e) {
      try {
        const errorMsg = normalizeErrorMessage(e?.message || 'Tekrar gönderme hatası')
        await updateProductStatus(row.sku, row.ideasoft_product_id, 'FAILED', errorMsg);
        if (batch?.id) await updateBatchStats(batch.id);
      } catch {
        // ignore
      }
      const errorMsg = normalizeErrorMessage(e.message)
      showNotification('Tekrar gönderme hatası: ' + errorMsg, 'error');
    } finally {
      setPostingId(null);
    }
  };

  const isSaving = (id) => savingId === id;
  const isPosting = (id) => postingId === id;

  return (
    <div className="project-detail">
    {notification.show && (
      <div className={`notification ${notification.type}`}>
        <span>{notification.message}</span>
        <button 
          className="notification-close" 
          onClick={() => setNotification({ show: false, message: '', type: 'info' })}
        >
          ×
        </button>
      </div>
    )}

    {confirmState.open && (
      <div className="confirm-backdrop" onClick={() => setConfirmState({ open: false, title: '', message: '', onConfirm: null })}>
        <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
          <button
            className="confirm-close"
            onClick={() => setConfirmState({ open: false, title: '', message: '', onConfirm: null })}
          >
            ×
          </button>
          <div className="confirm-title">{confirmState.title}</div>
          <div className="confirm-message">{confirmState.message}</div>
          <div className="confirm-actions">
            {confirmState.onConfirm ? (
              <>
                <button
                  className="btn btn-secondary"
                  onClick={() => setConfirmState({ open: false, title: '', message: '', onConfirm: null })}
                >
                  İptal
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => confirmState.onConfirm && confirmState.onConfirm()}
                >
                  Onayla
                </button>
              </>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => setConfirmState({ open: false, title: '', message: '', onConfirm: null })}
              >
                Tamam
              </button>
            )}
          </div>
        </div>
      </div>
    )}

      <div className="project-detail-header">
        <div className="project-title-section">
          <h2>{title}</h2>
          {batch && (
            <div className="project-stats-minimal">
              <span className="stat-pill">Durum: <strong className={batch.status.toLowerCase()}>{batch.status}</strong></span>
              <span className="stat-pill">Toplam: <strong>{batch.total_products}</strong></span>
              <span className="stat-pill">Başarılı: <strong className="text-success">{batch.successful_products}</strong></span>
              <span className="stat-pill">Başarısız: <strong className="text-danger">{batch.failed_products}</strong></span>
            </div>
          )}
        </div>
        <div className="project-header-actions">
          <button
            className="btn btn-bulk-pull"
            onClick={handleBulkPullFromIdeasoft}
            disabled={bulkPulling || loading}
          >
            {bulkPulling ? 'ÇEKİLİYOR...' : 'İDEASOFTTAN ÇEK'}
          </button>
          <button
            className="btn btn-bulk-db"
            onClick={handleBulkSave}
            disabled={bulkSaving || loading}
          >
            {bulkSaving ? 'KAYDEDİLİYOR...' : 'VERİTABANINA KAYDET'}
          </button>
          <button
            className="btn btn-bulk-ideasoft"
            onClick={handleBulkUpdateIdeasoft}
            disabled={bulkPosting || loading}
          >
            {bulkPosting ? 'GÖNDERİLİYOR...' : 'İDEASOFTA GÖNDER'}
          </button>
        </div>
      </div>

      {loading && !batch ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Proje detayları çekiliyor...</p>
        </div>
      ) : error ? (
        <div className="error-state">
          <h3>Hata</h3>
          <p>{error}</p>
        </div>
      ) : (
        <div className="detail-table-container">
          {pullingId === 'all' && (
            <div className="table-overlay">
              <div className="spinner"></div>
              <div className="overlay-text">Ideasoft verileri çekiliyor...</div>
            </div>
          )}
          <table className="detail-table">
            <thead>
              <tr>
                <th width="50" className="text-center">
                  <input
                    type="checkbox"
                    checked={selectedProducts.size > 0 && selectedProducts.size === products.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedProducts(new Set(products.map(p => p.id)));
                      } else {
                        setSelectedProducts(new Set());
                      }
                    }}
                    className="select-all-checkbox"
                  />
                </th>
                <th width="90">DURUM</th>
                <th width="40">ID</th>
                <th width="220">SKU</th>
                <th width="400">ÜRÜN ADI</th>
                <th width="150">FİYAT</th>
                <th width="150">STOK</th>
                <th width="250">KATEGORİ</th>
                <th width="80">AKTİF</th>
                <th width="250">RESİM URL</th>
                <th width="300">AÇIKLAMA (HTML)</th>
                <th width="250">İŞLEMLER</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const transferStatus = String(p.transfer_status || '').toUpperCase();
                const isFailed = transferStatus === 'FAILED';
                const isSuccess = transferStatus === 'SUCCESS';
                return (
                <tr key={p.id} className={`${p._dirty ? 'is-dirty' : ''} ${p._remoteStatus === 'missing' && p.ideasoft_product_id ? 'product-deleted' : ''}`}>
                  <td className="text-center">
                    <input
                      type="checkbox"
                      checked={selectedProducts.has(p.id)}
                      onChange={(e) => {
                        const newSelected = new Set(selectedProducts);
                        if (e.target.checked) {
                          newSelected.add(p.id);
                        } else {
                          newSelected.delete(p.id);
                        }
                        setSelectedProducts(newSelected);
                      }}
                      className="row-checkbox-select"
                    />
                  </td>
                  <td className="text-center cell-status">
                    {isFailed && (
                      <span className="status-icon-failed" title="Başarısız gönderim">❌</span>
                    )}
                    {isSuccess && (
                      <span className="status-icon-success" title="Başarılı gönderim">✅</span>
                    )}
                  </td>
                  <td className="text-center cell-id">{p.id}</td>
                  <td>
                    <input
                      className="table-cell-input"
                      value={p.sku || ''}
                      spellCheck="false"
                      onChange={(e) => setField(p.id, 'sku', e.target.value)}
                    />
                    {p._remote && String(p._remote?.sku || '').trim() !== String(p.sku || '').trim() && (
                      <div className="diff-hint">Ideasoft: {p._remote?.sku}</div>
                    )}
                  </td>
                  <td>
                    <input
                      className="table-cell-input fw-500"
                      value={p.name || ''}
                      onChange={(e) => setField(p.id, 'name', e.target.value)}
                    />
                    {p._remoteStatus === 'missing' && p.ideasoft_product_id && (
                      <div className="diff-hint" style={{ color: 'red', fontWeight: 'bold' }}>ÜRÜN İDEASOFTTAN SİLİNMİŞ</div>
                    )}
                    {p._remote && String(p._remote?.name || '').trim() !== String(p.name || '').trim() && (
                      <div className="diff-hint">Ideasoft: {p._remote?.name}</div>
                    )}
                  </td>
                  <td>
                    <input
                      className="table-cell-input text-right"
                      type="number"
                      value={p.price || 0}
                      onChange={(e) => setField(p.id, 'price', e.target.value)}
                    />
                    {p._remote && Number(p._remote?.price1 || 0) !== Number(p.price || 0) && (
                      <div className="diff-hint">Ideasoft: {p._remote?.price1}</div>
                    )}
                  </td>
                  <td>
                    <input
                      className="table-cell-input text-center"
                      type="number"
                      value={p.stock_amount || 0}
                      onChange={(e) => setField(p.id, 'stock_amount', e.target.value)}
                    />
                    {p._remote && Number(p._remote?.stockAmount || 0) !== Number(p.stock_amount || 0) && (
                      <div className="diff-hint">Ideasoft: {p._remote?.stockAmount}</div>
                    )}
                  </td>
                  <td>
                    <select
                      className="table-cell-input"
                      value={p.categoryId ?? ''}
                      onChange={(e) => setField(p.id, 'categoryId', e.target.value ? Number(e.target.value) : null)}
                      disabled={loadingCategories}
                    >
                      <option value="">{loadingCategories ? 'Yükleniyor...' : 'Kategori Seç'}</option>
                      {(() => {
                        const selectedId = p.categoryId
                        if (!selectedId) return null
                        const exists = categories.some(c => Number(c.id) === Number(selectedId))
                        if (exists) return null
                        const label = p.ideasoft_category_name || `Seçili: ${selectedId}`
                        return <option value={selectedId}>{label}</option>
                      })()}
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>) }
                    </select>
                    {p._remote && (p._remote?.categoryId !== undefined || p._remote?.categoryName) && p._remote?.categoryId !== p.categoryId && (
                      <div className="diff-hint">Ideasoft: {p._remote?.categoryName || 'Kategori Yok'}</div>
                    )}
                  </td>
                  <td className="text-center">
                    <input
                      type="checkbox"
                      className="row-checkbox"
                      checked={Number(p.status) === 1}
                      onChange={(e) => setField(p.id, 'status', e.target.checked ? 1 : 0)}
                    />
                    {p._remote && Number(p._remote?.status || 0) !== Number(p.status || 0) && (
                      <div className="diff-hint">Ideasoft: {Number(p._remote?.status) === 1 ? 'Aktif' : 'Pasif'}</div>
                    )}
                  </td>
                  <td>
                    <input
                      className="table-cell-input"
                      value={p.image_url || ''}
                      placeholder="Resim linki..."
                      onChange={(e) => setField(p.id, 'image_url', e.target.value)}
                    />
                  </td>
                  <td>
                    <textarea
                      className="table-cell-textarea"
                      value={p.description || ''}
                      onChange={(e) => setField(p.id, 'description', e.target.value)}
                    />
                    {p._remote && (() => {
                      const a = normalizeTextForCompare(p._remote?.details)
                      const b = normalizeTextForCompare(p.description)
                      if (!a || !b) return null
                      return a !== b ? <div className="diff-hint">Açıklama farklı</div> : null
                    })()}
                  </td>
                  <td>
                    <div className="row-action-buttons">
                      <button
                        className="btn btn-row-pull"
                        onClick={() => handlePullRow(p)}
                        disabled={pullingId === p.id || p._remoteStatus !== 'found'}
                        title="Ideasoft verisini çek ve DB'ye işle"
                      >
                        {pullingId === p.id ? '..' : 'İDEASOFTTAN ÇEK'}
                      </button>
                      <button
                        className="btn btn-row-save"
                        onClick={() => handleSaveRow(p)}
                        disabled={isSaving(p.id)}
                      >
                        {isSaving(p.id) ? '..' : 'VERİTABANINA KAYDET'}
                      </button>
                      {p._remoteStatus === 'missing' && p.ideasoft_product_id ? (
                        <button
                          className="btn btn-row-ideasoft-recreate"
                          onClick={() => handleRecreateDeletedProduct(p)}
                          disabled={postingId === p.id}
                          title="Silinmiş ürünü Ideasoft'a yeniden yükle"
                        >
                          {postingId === p.id ? '..' : 'YENİDEN YÜKLE'}
                        </button>
                      ) : (
                        <button
                          className="btn btn-row-ideasoft"
                          onClick={() => {
                            if (!p.ideasoft_product_id || p.transfer_status === 'FAILED') {
                              return handleRetryPostProduct(p)
                            }
                            return handleUpdateIdeasoftProduct(p)
                          }}
                          disabled={isPosting(p.id)}
                        >
                          {isPosting(p.id) ? '..' : 'İDEASOFTA GÖNDER'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ProjectDetail;
