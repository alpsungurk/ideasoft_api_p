import { useState, useEffect, useRef } from 'react';
import { readExcelFile, mapExcelColumns } from '../services/excelService';
import { enrichProductsWithGoogle, enrichProductImagesOnly } from '../services/googleService';
import { bulkCreateProducts, getStoredToken, getCategories, postProductDetail, postProductImage } from '../services/ideasoftService';
import ProductTable from './ProductTable';
import { createBatch, updateProductStatus, updateBatchStats, updateProductCategory, getBatchDetails, updateImportedProduct } from '../services/databaseService';
import { normalizeErrorMessage, isDuplicateError } from '../utils/errorHandler';
import './ProductImporter.css';

const ProductImporter = ({ onComplete, appConfig, onStepChange }) => {
    const [step, setStep] = useState(2); // 2: Excel Parse, 3: Gönderme
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(null);
    const [config, setConfig] = useState(appConfig || { apiKey: '', shopId: '' });
    const [results, setResults] = useState(null);
    const [editAll, setEditAll] = useState(false);
    const [selectedProducts, setSelectedProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loadingCategories, setLoadingCategories] = useState(false);
    const [showProjectModal, setShowProjectModal] = useState(false);
    const [projectName, setProjectName] = useState('');
    const [showApiKey, setShowApiKey] = useState(false);
    const [backupProducts, setBackupProducts] = useState(null);
    const [notification, setNotification] = useState({ show: false, message: '', type: 'info' });
    const [confirmation, setConfirmation] = useState({ show: false, message: '', onConfirm: null, onCancel: null });
    const [errorModal, setErrorModal] = useState({ open: false, title: '', message: '', onClose: null });
    const [geminiApiKeyModal, setGeminiApiKeyModal] = useState({ open: false });
    const [geminiApiKey, setGeminiApiKey] = useState('');
    const [geminiApiKeyStatus, setGeminiApiKeyStatus] = useState(null); // 'valid', 'invalid', 'checking', null
    const [showNewKeyInput, setShowNewKeyInput] = useState(false);
    const productTableRef = useRef(null);
    
    // SessionStorage'dan API key'i yükle
    useEffect(() => {
        const savedKey = sessionStorage.getItem('gemini_api_key');
        if (savedKey) {
            setGeminiApiKey(savedKey);
        }
    }, []);

    useEffect(() => {
        if (appConfig) setConfig(appConfig);
    }, [appConfig]);

    useEffect(() => {
        // Kategorileri sayfa yüklendiğinde yükle (step 3'e geçmeden önce)
        const storedToken = getStoredToken();
        if (storedToken?.access_token && config.shopId) {
            loadCategories();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config.shopId]);

    useEffect(() => {
        if (onStepChange) {
            onStepChange(step);
        }
    }, [step, onStepChange]);
    
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

    const loadCategories = async () => {
        const storedToken = getStoredToken();
        if (!storedToken?.access_token || !config.shopId) return;
        setLoadingCategories(true);
        try {
            const result = await getCategories(storedToken.access_token, config.shopId);
            if (result.success) setCategories(result.data);
        } catch (error) {
            console.error('Kategori yükleme hatası:', error);
        } finally {
            setLoadingCategories(false);
        }
    };

    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setLoading(true);
        setProgress({ current: 0, total: 100, message: 'Excel dosyası okunuyor...' });
        try {
            const excelData = await readExcelFile(file);
            setProgress({ current: 50, total: 100, message: 'Ürünler işleniyor...' });
            const mappedProducts = mapExcelColumns(excelData);
            setProducts(mappedProducts);
            setTimeout(() => {
                setStep(3);
                setProgress(null);
            }, 500);
        } catch (error) {
            showNotification('Excel dosyası okunurken hata oluştu: ' + error.message, 'error');
            setProgress(null);
        } finally {
            setLoading(false);
        }
    };


    const handleEnrichWithGoogle = async () => {
        setLoading(true);
        setProgress({ current: 0, total: products.length, message: 'Google\'dan sadece resimler toplanıyor...' });
        try {
            const enriched = await enrichProductImagesOnly([...products], setProgress);
            setProducts(enriched);
            showNotification('Ürün resimleri Google üzerinden toplandı!', 'success');
        } catch (error) {
            if (error.message === 'GOOGLE_QUOTA_EXCEEDED') {
                showNotification('Search engine hakkınız doldu! Google API limitinizi kontrol edin.', 'error');
            } else {
            showNotification('Resim toplama hatası: ' + error.message, 'error');
            }
        } finally {
            setLoading(false);
            setProgress(null);
        }
    };
    
    const handleEnrichWithGemini = () => {
        if (products.length === 0) {
            showNotification('Lütfen önce Excel dosyası yükleyin!', 'warning');
            return;
        }
        
        // SessionStorage'dan key'i yükle
        const savedKey = sessionStorage.getItem('gemini_api_key');
        if (savedKey) {
            setGeminiApiKey(savedKey);
        }
        
        // Modal aç
        setGeminiApiKeyModal({ open: true });
        setShowNewKeyInput(false);
    };
    
    const validateGeminiApiKey = async (key) => {
        if (!key || !key.trim()) {
            return { valid: false, message: 'API Key boş olamaz' };
        }
        
        try {
            // Supabase Edge Function URL'i
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') || ''
            const apiBase = supabaseUrl ? `${supabaseUrl}/functions/v1` : '/api'
            const apiUrl = `${apiBase}/gemini-validate-key`
            
            // Authorization headers
            const headers = { 'Content-Type': 'application/json' }
            if (import.meta.env.VITE_SUPABASE_ANON_KEY) {
                headers['Authorization'] = `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
                headers['apikey'] = import.meta.env.VITE_SUPABASE_ANON_KEY
            }
            
            // Test isteği gönder
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({ geminiApiKey: key.trim() })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                return { 
                    valid: false, 
                    message: errorData.message || `HTTP ${response.status}: API Key doğrulanamadı` 
                };
            }
            
            const result = await response.json();
            return result;
        } catch (error) {
            return { 
                valid: false, 
                message: `Bağlantı hatası: ${error.message || 'API Key doğrulanamadı'}` 
            };
        }
    };
    
    const handleGeminiApiKeyCheck = async () => {
        const keyToCheck = geminiApiKey.trim();
        if (!keyToCheck) {
            showNotification('Lütfen Gemini API Key giriniz!', 'warning');
            return;
        }
        
        setGeminiApiKeyStatus('checking');
        const validation = await validateGeminiApiKey(keyToCheck);
        
        if (validation.valid) {
            setGeminiApiKeyStatus('valid');
            // SessionStorage'a kaydet
            sessionStorage.setItem('gemini_api_key', keyToCheck);
            setGeminiApiKey(keyToCheck);
            showNotification('API Key geçerli!', 'success');
        } else {
            setGeminiApiKeyStatus('invalid');
            showNotification(validation.message || 'API Key geçerli değil!', 'error');
        }
    };
    
    const handleGeminiApiKeySubmit = async () => {
        const keyToUse = geminiApiKey.trim();
        if (!keyToUse) {
            showNotification('Lütfen Gemini API Key giriniz!', 'warning');
            return;
        }
        
        // Key geçerli değilse kontrol et
        if (geminiApiKeyStatus !== 'valid') {
            setGeminiApiKeyStatus('checking');
            const validation = await validateGeminiApiKey(keyToUse);
            if (!validation.valid) {
                setGeminiApiKeyStatus('invalid');
                showNotification(validation.message || 'API Key geçerli değil!', 'error');
                return;
            }
            setGeminiApiKeyStatus('valid');
        }
        
        // SessionStorage'a kaydet
        sessionStorage.setItem('gemini_api_key', keyToUse);
        setGeminiApiKeyModal({ open: false });
        setShowNewKeyInput(false);
        
        setLoading(true);
        setProgress({ current: 0, total: products.length, message: 'Gemini ile ürün açıklamaları oluşturuluyor...' });
        
        try {
            const updatedProducts = [];
            
            for (let i = 0; i < products.length; i++) {
                const product = products[i];
                
                setProgress({ current: i + 1, total: products.length, message: `${i + 1}/${products.length} ürün açıklaması oluşturuluyor... (${product.name || product.sku || 'Ürün ' + i})` });
                
                // Supabase Edge Function URL'i
                const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') || ''
                const apiBase = supabaseUrl ? `${supabaseUrl}/functions/v1` : '/api'
                const apiUrl = `${apiBase}/gemini-generate-description`
                
                // Authorization headers
                const headers = { 'Content-Type': 'application/json' }
                if (import.meta.env.VITE_SUPABASE_ANON_KEY) {
                    headers['Authorization'] = `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
                    headers['apikey'] = import.meta.env.VITE_SUPABASE_ANON_KEY
                }
                
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        productName: product.name || product.sku || 'Ürün',
                        brand: product.brand || '',
                        features: `Fiyat: ${product.price}, Stok: ${product.stockAmount}, Kategori: ${product.categoryId}`,
                        geminiApiKey: keyToUse
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    // Update the product with the generated description
                    const updatedProduct = { ...product, description: result.description };
                    updatedProducts.push(updatedProduct);
                } else {
                    // Keep the original product if description generation fails
                    updatedProducts.push(product);
                    
                    // Gemini API quota exceeded kontrolü
                    if (result.quotaExceeded || (result.error && result.error.includes('keyi bitti'))) {
                        showNotification('Gemini API keyi bitti! İşlem durduruldu.', 'error');
                        break; // Döngüyü durdur
                    }
                }
                
                // Small delay to avoid overwhelming the API
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            setProducts(updatedProducts);
            showNotification('Tüm ürünler için açıklama oluşturma tamamlandı!', 'success');
        } catch (error) {
            showNotification('Açıklama oluşturma hatası: ' + error.message, 'error');
        } finally {
            setLoading(false);
            setProgress(null);
        }
    };

    const handleImportClick = () => {
        if (!config.apiKey || !config.shopId) {
            showNotification('Lütfen API Key ve Shop ID giriniz!', 'warning');
            return;
        }
        setProjectName(`Proje - ${new Date().toLocaleDateString('tr-TR')}`);
        setShowProjectModal(true);
    };

    const handleProjectSubmit = async () => {
        if (!projectName.trim()) {
            showNotification('Lütfen bir proje ismi giriniz!', 'warning');
            return;
        }
        setShowProjectModal(false);
        await startImportProcess(projectName);
    };

    const startImportProcess = async (pName) => {
        setLoading(true);
        let batchId = null;
        try {
            setProgress({ current: 0, total: 100, message: 'Proje oluşturuluyor...' });
            const batchResult = await createBatch(products, pName);
            batchId = batchResult.batchId;

            let skuToLocalId = {};
            if (batchId) {
                const batchDetails = await getBatchDetails(batchId);
                if (batchDetails?.success && Array.isArray(batchDetails?.data?.products)) {
                    skuToLocalId = Object.fromEntries(
                        batchDetails.data.products
                            .filter(p => p?.sku)
                            .map(p => [String(p.sku).trim(), p.id])
                    );
                }
            }

            setProgress({ current: 0, total: products.length, message: 'Ürünler Ideasoft\'a aktarılıyor...' });
            const failedProducts = [];
            const importResults = await bulkCreateProducts(products, config.apiKey, config.shopId, async (prog) => {
                setProgress(prog);
                
                if (prog.product && batchId) {
                    const currentProd = products[prog.current - 1];
                    if (currentProd?.sku) {
                        const localProductId = skuToLocalId[String(currentProd.sku).trim()];

                        await updateProductStatus(
                            currentProd.sku,
                            prog.success && prog.data?.id ? prog.data.id : null,
                            prog.success ? 'SUCCESS' : 'FAILED',
                            prog.error
                        );

                        if (prog.success && localProductId) {
                            const imageUrl = currentProd.image || currentProd.image_url || '';
                            const description = currentProd.description || '';

                            if (imageUrl || description) {
                                try {
                                    await updateImportedProduct(localProductId, {
                                        imageUrl: imageUrl || undefined,
                                        description: description || undefined
                                    });
                                } catch (e) {
                                }
                            }

                            if (description && String(description).trim()) {
                                try {
                                    await postProductDetail({
                                        shopId: config.shopId,
                                        accessToken: config.apiKey,
                                        localProductId,
                                        details: description,
                                        extraDetails: ''
                                    });
                                } catch (e) {
                                }
                            }

                            if (imageUrl && String(imageUrl).trim()) {
                                try {
                                    await postProductImage({
                                        shopId: config.shopId,
                                        accessToken: config.apiKey,
                                        localProductId,
                                        imageUrl,
                                        ideasoftProductId: prog?.data?.id
                                    });
                                } catch (e) {
                                }
                            }
                        }
                    }
                }
                
                // Başarısız ürünleri topla
                if (!prog.success && prog.error) {
                    const currentProd = products[prog.current - 1];
                    const productName = currentProd?.name || currentProd?.sku || `Ürün #${prog.current}`;
                    let errorMsg = normalizeErrorMessage(prog.error);
                    
                    // Duplicate hatasını kontrol et (daha geniş kontrol)
                    const errorLower = String(prog.error || '').toLowerCase();
                    const normalizedLower = errorMsg.toLowerCase();
                    
                    if (
                        isDuplicateError(prog.error) || 
                        isDuplicateError(errorMsg) ||
                        errorLower.includes('aynı üründen var') ||
                        errorLower.includes('aynı sku') ||
                        errorLower.includes('aynı ürün') ||
                        errorLower.includes('duplicate') ||
                        errorLower.includes('already exists') ||
                        errorLower.includes('zaten var') ||
                        normalizedLower.includes('aynı üründen var') ||
                        normalizedLower.includes('aynı sku') ||
                        normalizedLower.includes('aynı ürün') ||
                        (prog.statusCode === 400 && (errorLower.includes('invalid') || errorLower.includes('bad request')))
                    ) {
                        // 400 hatası ve duplicate benzeri mesaj ise "Aynı üründen var" olarak işaretle
                        errorMsg = 'Aynı üründen var';
                    }
                    
                    failedProducts.push({
                        name: productName,
                        sku: currentProd?.sku || '',
                        error: errorMsg
                    });
                }
            });
            if (batchId) await updateBatchStats(batchId);

            // Sonuçları hesapla
            const resultsData = {
                total: importResults.length,
                success: importResults.filter(r => r.success).length,
                failed: importResults.filter(r => !r.success).length,
                details: importResults,
            };

            // Başarısız ürünleri modal olarak göster
            if (failedProducts.length > 0) {
                const duplicateProducts = failedProducts.filter(p => p.error === 'Aynı üründen var');
                let modalMessage = `❌ ${failedProducts.length} ürün başarısız oldu!\n\n`;
                
                if (duplicateProducts.length > 0) {
                    const productList = duplicateProducts.map(p => `- ${p.name}${p.sku ? ` (SKU: ${p.sku})` : ''}`).join('\n');
                    modalMessage += `Aynı üründen var (SKU veya ürün adı Ideasoft'ta zaten mevcut):\n${productList}`;
                }
                
                // Diğer hatalar varsa onları da göster
                const otherErrors = failedProducts.filter(p => p.error !== 'Aynı üründen var');
                if (otherErrors.length > 0) {
                    if (duplicateProducts.length > 0) modalMessage += '\n\n';
                    const errorList = otherErrors.map(p => `- ${p.name}${p.sku ? ` (SKU: ${p.sku})` : ''}: ${p.error}`).join('\n');
                    modalMessage += `Başarısız ürünler:\n${errorList}`;
                }
                
                if (modalMessage) {
                    setErrorModal({
                        open: true,
                        title: '❌ Aktarım Başarısız',
                        message: modalMessage,
                        onClose: () => {
                            setErrorModal({ open: false, title: '', message: '', onClose: null });
                            setResults(resultsData);
                        }
                    });
                    return; // Modal gösterildi, results'ı modal kapandıktan sonra göster
                }
            }

            setResults(resultsData);
        } catch (error) {
            showNotification('Aktarım sırasında bir hata oluştu: ' + error.message, 'error');
        } finally {
            setLoading(false);
            setProgress(null);
        }
    };

    const handleBulkCategoryAssign = (categoryId) => {
        if (!categoryId) return;
        const category = categories.find(c => c.id === parseInt(categoryId));
        if (!category) return;
        
        showConfirmation(`Tüm ${products.length} ürünün kategorisini "${category.name}" olarak güncellemek istediğinize emin misiniz?`, () => {
            const updated = products.map(p => ({ ...p, categoryId: category.id, categoryName: category.name }));
            setProducts(updated);
            showNotification(`Kategori "${category.name}" olarak güncellendi. Değişiklikler gönderim sırasında kaydedilecektir.`, 'success');
        });
    };

    const handleProductUpdate = (index, updatedProduct) => {
        setProducts(prev => prev.map((p, i) => i === index ? updatedProduct : p));
    };

    const handleProductDelete = (index) => {
        setProducts(prev => prev.filter((_, i) => i !== index));
        setSelectedProducts(prev => prev.filter(i => i !== index).map(i => i > index ? i - 1 : i));
    };

    const handleBulkDelete = () => {
        if (selectedProducts.length === 0) return;
        
        showConfirmation(`${selectedProducts.length} ürünü silmek istediğinize emin misiniz?`, () => {
            const updatedProducts = products.filter((_, index) => !selectedProducts.includes(index));
            setProducts(updatedProducts);
            setSelectedProducts([]);
        });
    };

    const handleToggleEdit = () => {
        if (!editAll) {
            // Düzenleme moduna girerken yedek al
            setBackupProducts(JSON.parse(JSON.stringify(products)));
            setEditAll(true);
        } else {
            // Kaydet derse yedeği temizle
            setBackupProducts(null);
            setEditAll(false);
        }
    };

    const handleCancelEdit = () => {
        if (backupProducts) {
            setProducts(backupProducts);
            setBackupProducts(null);
        }
        setEditAll(false);
    };
    
    const showConfirmation = (message, onConfirm, onCancel = null) => {
        setConfirmation({ show: true, message, onConfirm, onCancel });
    };
    
    const handleConfirmationConfirm = () => {
        const { onConfirm } = confirmation;
        setConfirmation({ show: false, message: '', onConfirm: null, onCancel: null });
        if (onConfirm) {
            onConfirm();
        }
    };
    
    const handleConfirmationCancel = () => {
        const { onCancel } = confirmation;
        setConfirmation({ show: false, message: '', onConfirm: null, onCancel: null });
        if (onCancel) {
            onCancel();
        }
    };

    // Render Functions
    const renderUploadStep = () => (
        <div className="step-container">
            <label htmlFor="file-upload" className="upload-area">
                <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} id="file-upload" style={{ display: 'none' }} />

                <div className="upload-icon" style={{ fontSize: '4rem', marginBottom: '24px' }}>📊</div>

                <div className="step-header" style={{ marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '12px' }}>Excel Dosyası Yükle</h2>
                    <p style={{ color: 'var(--text-light)', fontSize: '1.05rem', maxWidth: '450px', margin: '0 auto' }}>
                        İçe aktarmak istediğiniz ürünleri içeren <strong>.xlsx</strong> veya <strong>.xls</strong> dosyasını seçin veya bu alana sürükleyin.
                    </p>
                </div>

                <div className="btn btn-primary upload-button">
                    <span>📁 Excel Dosyası Seç</span>
                </div>

                <p className="upload-hint">
                    Hızlı ve kolay ürün aktarımı için hazırlanan Excel şablonunuzu kullanın.
                </p>
            </label>
        </div>
    );

    const renderImportStep = () => (
        <div className="step-container">
            <div className="step-header">
                <h2>Ürünleri Kontrol Et ve Gönder</h2>
                <p>Aşağıdaki {products.length} ürün Ideasoft mağazanıza pasif olarak aktarılacak.</p>
            </div>

            <div className="top-actions">
                <button onClick={() => setStep(2)} className="btn btn-secondary">← Yeni Dosya Yükle</button>
                <button onClick={handleImportClick} className="btn btn-primary" disabled={loading}>
                    {loading ? 'Aktarılıyor...' : '🚀 Gönderimi Başlat'}
                </button>
            </div>

            <div className="import-summary">
                <h3>Gönderim Özeti</h3>
                <ul>
                    <li><span>Toplam Ürün:</span> <strong>{products.length}</strong></li>
                    <li><span>Mağaza:</span> <strong>{config.shopId}</strong></li>
                    <li className="api-key-row">
                        <span>API Key:</span>
                        <strong className="api-key-display">
                            {showApiKey ? config.apiKey : '****************'}
                        </strong>
                        <button
                            type="button"
                            className="btn-text-only"
                            onClick={() => setShowApiKey(!showApiKey)}
                            title={showApiKey ? "Gizle" : "Göster"}
                        >
                            {showApiKey ? '👁️' : '👁️'}
                        </button>
                    </li>
                </ul>
            </div>

            <div className="table-controls">
                <div className="action-buttons">
                    <button onClick={handleEnrichWithGoogle} className="btn btn-secondary" disabled={loading}>🖼️ Google'dan Resimleri Al</button>
                    <button onClick={handleEnrichWithGemini} className="btn btn-secondary" disabled={loading}>🤖 Açıklamaları Gemini ile Oluştur</button>
                    {!editAll ? (
                        <button onClick={handleToggleEdit} className="btn btn-warning" disabled={loading}>✏️ Düzenle</button>
                    ) : (
                        <>
                            <button onClick={handleToggleEdit} className="btn btn-success" disabled={loading}>✓ Değişiklikleri Kaydet</button>
                            <button onClick={handleCancelEdit} className="btn btn-danger" disabled={loading}>✕ İptal Et</button>
                        </>
                    )}
                    <button onClick={handleBulkDelete} className="btn btn-danger" disabled={loading || selectedProducts.length === 0}>
                        🗑️ {selectedProducts.length > 0 ? `${selectedProducts.length} Ürünü Sil` : 'Sil'}
                    </button>
                </div>
                <div className="bulk-category-control">
                    <label htmlFor="bulk-category-select">Toplu Kategori Ata:</label>
                    <select id="bulk-category-select" onChange={(e) => handleBulkCategoryAssign(e.target.value)} className="bulk-category-select" disabled={loading || loadingCategories}>
                        <option value="">{loadingCategories ? 'Yükleniyor...' : 'Kategori Seç'}</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
            </div>

            <ProductTable
                ref={productTableRef}
                products={products}
                onProductUpdate={handleProductUpdate}
                onProductDelete={handleProductDelete}
                editAll={editAll}
                onEditAllChange={setEditAll}
                selectedProducts={selectedProducts}
                onSelectProduct={(i) => setSelectedProducts(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i])}
                onSelectAll={(checked) => setSelectedProducts(checked ? products.map((_, i) => i) : [])}
                categories={categories}
                loadingCategories={loadingCategories}
            />
        </div>
    );

    const renderResultsStep = () => (
        <div className="results-section">
            <div className="step-header">
                <h2>Aktarım Tamamlandı!</h2>
            </div>
            <div className="results-stats">
                <div className="stat-card success"><h4>Başarılı</h4><p>{results.success}</p></div>
                <div className="stat-card failed"><h4>Başarısız</h4><p>{results.failed}</p></div>
                <div className="stat-card total"><h4>Toplam</h4><p>{results.total}</p></div>
            </div>
            <div className="action-buttons" style={{ justifyContent: 'center' }}>
                <button onClick={() => onComplete()} className="btn btn-secondary">Projeler Sayfasına Dön</button>
                <button onClick={() => {
                    setResults(null);
                    setProducts([]);
                    setStep(2);
                    window.location.reload();
                }} className="btn btn-primary">Yeni Aktarım Başlat</button>
            </div>
        </div>
    );

    return (
        <div className="product-importer">
            {loadingCategories && (
                <div className="progress-overlay">
                    <div className="progress-card">
                        <div className="spinner" style={{ margin: '0 auto 16px', width: '40px', height: '40px' }}></div>
                        <h3>Kategoriler yükleniyor...</h3>
                    </div>
                </div>
            )}
            {loading && progress && (
                <div className="progress-overlay">
                    <div className="progress-card">
                        <h3>{progress.message}</h3>
                        <div className="progress-bar"><div className="progress-fill" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div></div>
                        <p>{progress.current} / {progress.total}</p>
                        {progress.product && <p className="current-product">{progress.product}</p>}
                    </div>
                </div>
            )}
            {notification.show && (
                <div className={`notification-overlay notification-${notification.type}`}>
                    <div className="notification-content">
                        <span className="notification-message">{notification.message}</span>
                        <button className="notification-close" onClick={() => setNotification({ show: false, message: '', type: 'info' })}>×</button>
                    </div>
                </div>
            )}
            {showProjectModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Proje İsmi Belirleyin</h3>
                        <p>Bu gönderim işlemi için daha sonra hatırlayacağınız bir isim giriniz.</p>
                        <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Örn: Casper Ürünleri - 29.12" className="modal-input" autoFocus />
                        <div className="modal-actions">
                            <button onClick={() => setShowProjectModal(false)} className="btn btn-secondary">İptal</button>
                            <button onClick={handleProjectSubmit} className="btn btn-primary">Kaydet ve Başlat</button>
                        </div>
                    </div>
                </div>
            )}
            {confirmation.show && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Onay Gerekli</h3>
                        <p>{confirmation.message}</p>
                        <div className="modal-actions">
                            <button onClick={handleConfirmationCancel} className="btn btn-secondary">İptal</button>
                            <button onClick={handleConfirmationConfirm} className="btn btn-primary">Onayla</button>
                        </div>
                    </div>
                </div>
            )}
            {errorModal.open && (
                <div className="modal-overlay" onClick={() => errorModal.onClose ? errorModal.onClose() : setErrorModal({ open: false, title: '', message: '', onClose: null })}>
                    <div className="modal-content error-modal" onClick={(e) => e.stopPropagation()}>
                        <button
                            className="modal-close"
                            onClick={() => errorModal.onClose ? errorModal.onClose() : setErrorModal({ open: false, title: '', message: '', onClose: null })}
                            style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#dc2626' }}
                        >
                            ×
                        </button>
                        <h3 style={{ color: '#dc2626', marginBottom: '16px' }}>{errorModal.title}</h3>
                        <div style={{ whiteSpace: 'pre-line', marginBottom: '20px', lineHeight: '1.6', color: '#991b1b' }}>{errorModal.message}</div>
                        <div className="modal-actions">
                            <button 
                                onClick={() => errorModal.onClose ? errorModal.onClose() : setErrorModal({ open: false, title: '', message: '', onClose: null })} 
                                className="btn btn-primary"
                                style={{ backgroundColor: '#dc2626', borderColor: '#dc2626' }}
                            >
                                Tamam
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {geminiApiKeyModal.open && (
                <div className="modal-overlay" onClick={() => {
                    setGeminiApiKeyModal({ open: false });
                    setShowNewKeyInput(false);
                    setGeminiApiKeyStatus(null);
                }}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <button
                            className="modal-close"
                            onClick={() => {
                                setGeminiApiKeyModal({ open: false });
                                setShowNewKeyInput(false);
                                setGeminiApiKeyStatus(null);
                            }}
                            style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}
                        >
                            ×
                        </button>
                        <h3>Gemini API Key</h3>
                        <p style={{ marginBottom: '16px', fontSize: '0.9rem', color: '#666' }}>
                            Gemini API Key'inizi giriniz. Bu key ürün açıklamalarını oluşturmak için kullanılacaktır.
                        </p>
                        
                        {!showNewKeyInput && geminiApiKey && (
                            <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '0.85rem', color: '#666' }}>Mevcut Key:</span>
                                    <span style={{ fontSize: '0.85rem', fontFamily: 'monospace', color: '#333' }}>
                                        {geminiApiKey.substring(0, 20)}...
                                    </span>
                                </div>
                                {geminiApiKeyStatus === 'valid' && (
                                    <div style={{ color: '#10b981', fontSize: '0.85rem', fontWeight: '600' }}>✓ Geçerli</div>
                                )}
                                {geminiApiKeyStatus === 'invalid' && (
                                    <div style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: '600' }}>✗ Geçerli değil</div>
                                )}
                                {geminiApiKeyStatus === 'checking' && (
                                    <div style={{ color: '#f59e0b', fontSize: '0.85rem', fontWeight: '600' }}>Kontrol ediliyor...</div>
                                )}
                                {geminiApiKeyStatus === null && (
                                    <button 
                                        onClick={handleGeminiApiKeyCheck}
                                        className="btn btn-secondary"
                                        style={{ fontSize: '0.8rem', padding: '6px 12px', marginTop: '8px' }}
                                    >
                                        Key'i Kontrol Et
                                    </button>
                                )}
                            </div>
                        )}
                        
                        {showNewKeyInput && (
                            <input
                                type="password"
                                className="modal-input"
                                placeholder="Yeni Gemini API Key yapıştırın..."
                                value={geminiApiKey}
                                onChange={(e) => {
                                    setGeminiApiKey(e.target.value);
                                    setGeminiApiKeyStatus(null);
                                }}
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleGeminiApiKeyCheck();
                                    }
                                }}
                            />
                        )}
                        
                        {!showNewKeyInput && (
                            <button 
                                onClick={() => {
                                    setShowNewKeyInput(true);
                                    setGeminiApiKey('');
                                    setGeminiApiKeyStatus(null);
                                }}
                                className="btn btn-secondary"
                                style={{ width: '100%', marginBottom: '16px' }}
                            >
                                Yeni Key Gir
                            </button>
                        )}
                        
                        {showNewKeyInput && (
                            <div style={{ marginBottom: '16px' }}>
                                {geminiApiKeyStatus === 'valid' && (
                                    <div style={{ color: '#10b981', fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px' }}>✓ Geçerli</div>
                                )}
                                {geminiApiKeyStatus === 'invalid' && (
                                    <div style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px' }}>✗ Geçerli değil</div>
                                )}
                                {geminiApiKeyStatus === 'checking' && (
                                    <div style={{ color: '#f59e0b', fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px' }}>Kontrol ediliyor...</div>
                                )}
                                <button 
                                    onClick={handleGeminiApiKeyCheck}
                                    className="btn btn-secondary"
                                    disabled={!geminiApiKey.trim() || geminiApiKeyStatus === 'checking'}
                                    style={{ width: '100%', marginBottom: '8px' }}
                                >
                                    {geminiApiKeyStatus === 'checking' ? 'Kontrol Ediliyor...' : "Key'i Kontrol Et"}
                                </button>
                            </div>
                        )}
                        
                        <div className="modal-actions">
                            <button 
                                onClick={() => {
                                    setGeminiApiKeyModal({ open: false });
                                    setShowNewKeyInput(false);
                                    setGeminiApiKeyStatus(null);
                                }} 
                                className="btn btn-secondary"
                            >
                                İptal
                            </button>
                            <button 
                                onClick={handleGeminiApiKeySubmit} 
                                className="btn btn-primary"
                                disabled={!geminiApiKey.trim() || geminiApiKeyStatus === 'checking' || (geminiApiKeyStatus !== 'valid' && showNewKeyInput)}
                            >
                                Devam Et
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {step === 2 && !results && !errorModal.open && renderUploadStep()}
            {step === 3 && !results && !errorModal.open && renderImportStep()}
            {results && !errorModal.open && renderResultsStep()}
        </div>
    );
};

export default ProductImporter;
