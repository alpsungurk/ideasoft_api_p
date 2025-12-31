import { useState, useEffect, useRef } from 'react';
import { readExcelFile, mapExcelColumns } from '../services/excelService';
import { enrichProductsWithGoogle, enrichProductImagesOnly } from '../services/googleService';
import { bulkCreateProducts, getStoredToken, getCategories, postProductDetail, postProductImage } from '../services/ideasoftService';
import ProductTable from './ProductTable';
import { createBatch, updateProductStatus, updateBatchStats, updateProductCategory, getBatchDetails, updateImportedProduct } from '../services/databaseService';
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
    const productTableRef = useRef(null);

    useEffect(() => {
        if (appConfig) setConfig(appConfig);
    }, [appConfig]);

    useEffect(() => {
        if (step === 3 && products.length > 0 && config.shopId) {
            loadCategories();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, products.length, config.shopId]);

    useEffect(() => {
        if (onStepChange) {
            onStepChange(step);
        }
    }, [step, onStepChange]);
    
    const showNotification = (message, type = 'info') => {
        setNotification({ show: true, message, type });
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
            console.error('Kategoriler yüklenirken hata:', error);
        } finally {
            setLoadingCategories(true);
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
            showNotification('Resim toplama hatası: ' + error.message, 'error');
        } finally {
            setLoading(false);
            setProgress(null);
        }
    };
    
    const handleEnrichWithGemini = async () => {
        if (products.length === 0) {
            showNotification('Lütfen önce Excel dosyası yükleyin!', 'warning');
            return;
        }
        
        setLoading(true);
        setProgress({ current: 0, total: products.length, message: 'Gemini ile ürün açıklamaları oluşturuluyor...' });
        
        try {
            const updatedProducts = [];
            
            for (let i = 0; i < products.length; i++) {
                const product = products[i];
                
                setProgress({ current: i + 1, total: products.length, message: `${i + 1}/${products.length} ürün açıklaması oluşturuluyor... (${product.name || product.sku || 'Ürün ' + i})` });
                
                const response = await fetch('/api/generate-product-description', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        productName: product.name || product.sku || 'Ürün',
                        brand: product.brand || '',
                        features: `Fiyat: ${product.price}, Stok: ${product.stockAmount}, Kategori: ${product.categoryId}`
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    // Update the product with the generated description
                    const updatedProduct = { ...product, description: result.description };
                    updatedProducts.push(updatedProduct);
                } else {
                    console.error(`Ürün ${product.name || product.sku} için açıklama oluşturulamadı:`, result.error);
                    // Keep the original product if description generation fails
                    updatedProducts.push(product);
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
                                    console.error('DB updateImportedProduct failed:', e);
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
                                    console.error('postProductDetail failed:', e);
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
                                    console.error('postProductImage failed:', e);
                                }
                            }
                        }
                    }
                }
            });
            if (batchId) await updateBatchStats(batchId);

            setResults({
                total: importResults.length,
                success: importResults.filter(r => r.success).length,
                failed: importResults.filter(r => !r.success).length,
                details: importResults,
            });
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
                <button onClick={() => setStep(2)} className="btn btn-primary">Yeni Aktarım Başlat</button>
            </div>
        </div>
    );

    return (
        <div className="product-importer">
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

            {step === 2 && !results && renderUploadStep()}
            {step === 3 && !results && renderImportStep()}
            {results && renderResultsStep()}
        </div>
    );
};

export default ProductImporter;
