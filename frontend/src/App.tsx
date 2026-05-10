import { useState, useRef, useEffect } from 'react';
import './App.css';

// ─── Configuration ────────────────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ─── Presets ──────────────────────────────────────────────────────────────────
const OUTFIT_PRESETS = [
  { label: '👗 Red Gown', prompt: 'An elegant red evening gown with sequin details, floor-length skirt, and a sophisticated silhouette.' },
  { label: '👔 Business Suit', prompt: 'A navy blue tailored business suit, crisp white dress shirt, and a premium silk tie.' },
  { label: '🧥 Winter Chic', prompt: 'A stylish beige wool overcoat, cashmere scarf, and professional winter attire.' },
  { label: '🤵 Formal Black Tie', prompt: 'A classic black tuxedo, white wing-tip collar shirt, and a satin bow tie.' },
];

const SIZE_OPTIONS = [
  { label: 'Portrait', sub: '768×1344', value: '768x1344' },
  { label: 'Square', sub: '1024×1024', value: '1024x1024' },
  { label: 'Landscape', sub: '1344×768', value: '1344x768' },
];

type TryOnMode = 'text' | 'product';

function App() {
  const [mode, setMode] = useState<TryOnMode>('text');
  const [userImageFile, setUserImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [productImageFile, setProductImageFile] = useState<File | null>(null);
  const [productPreviewUrl, setProductPreviewUrl] = useState<string | null>(null);
  const productInputRef = useRef<HTMLInputElement>(null);

  const [tryOnResult, setTryOnResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [selectedSize, setSelectedSize] = useState('768x1344');
  const [error, setError] = useState<string | null>(null);
  const [combinedDescription, setCombinedDescription] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<'online' | 'offline' | 'checking'>('checking');

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    const checkServer = async () => {
      try {
        const resp = await fetch(`${API_BASE}/`);
        if (resp.ok) setServerStatus('online');
        else setServerStatus('offline');
      } catch {
        setServerStatus('offline');
      }
    };
    checkServer();
  }, []);

  const handleUserFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUserImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setTryOnResult(null);
    setError(null);
  };

  const handleProductFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProductImageFile(file);
    setProductPreviewUrl(URL.createObjectURL(file));
    setTryOnResult(null);
    setError(null);
  };

  const handleTryOn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userImageFile) {
      setError('Please upload your photo to begin.');
      return;
    }
    if (mode === 'text' && !prompt.trim()) {
      setError('Describe the outfit you want to visualize.');
      return;
    }
    if (mode === 'product' && !productImageFile) {
      setError('Please upload a product/clothing image.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('userPhoto', userImageFile);
      formData.append('size', selectedSize);

      let endpoint: string;
      if (mode === 'product' && productImageFile) {
        endpoint = `${API_BASE}/api/tryon`;
        formData.append('productImage', productImageFile);
      } else {
        endpoint = `${API_BASE}/api/tryon/text`;
        formData.append('prompt', prompt);
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        setTryOnResult(data.resultImage);
        setCombinedDescription(data.combinedDescription || null);
      } else {
        setError(data.error || data.details || 'The AI encountered an issue.');
      }
    } catch (err: any) {
      setError('Connection failed. Backend may be offline.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setUserImageFile(null);
    setPreviewUrl(null);
    setProductImageFile(null);
    setProductPreviewUrl(null);
    setTryOnResult(null);
    setPrompt('');
    setError(null);
    setCombinedDescription(null);
  };

  return (
    <div className="app-wrapper">
      <div className="container">
        <header className="header">
          <div className="status-bar">
            <span className="badge">Next-Gen Generative Fashion</span>
            <div className={`server-indicator ${serverStatus}`}>
              <span className="dot"></span>
              {serverStatus === 'checking' ? 'Checking API...' : serverStatus === 'online' ? 'API Online' : 'API Offline'}
            </div>
          </div>
          <h1>Virtual <br /> Fashion Studio</h1>
          <p className="subtitle">
            Experience our dual-stage AI pipeline. Analyze your build, Manifest any outfit.
          </p>
        </header>

        <main className="main-content">
          <aside className="glass-card controls-card">
            <form onSubmit={handleTryOn}>
              <div className="input-group">
                <div className="input-label"><span className="label-num">⚡</span>Mode</div>
                <div className="mode-toggle">
                  <button type="button" className={`mode-btn ${mode === 'text' ? 'active' : ''}`} onClick={() => setMode('text')}>✏️ Text</button>
                  <button type="button" className={`mode-btn ${mode === 'product' ? 'active' : ''}`} onClick={() => setMode('product')}>👗 Product</button>
                </div>
              </div>

              <div className="input-group">
                <div className="input-label"><span className="label-num">1</span>User Photo</div>
                <div className="upload-zone" onClick={() => fileInputRef.current?.click()}>
                  {previewUrl ? <img src={previewUrl} className="upload-preview" /> : <div className="upload-placeholder">Upload Portrait</div>}
                  <input type="file" ref={fileInputRef} onChange={handleUserFileChange} hidden />
                </div>
              </div>

              {mode === 'text' ? (
                <div className="input-group">
                  <div className="input-label"><span className="label-num">2</span>Outfit</div>
                  <div className="preset-grid">
                    {OUTFIT_PRESETS.map(p => (
                      <button key={p.label} type="button" className="preset-btn" onClick={() => setPrompt(p.prompt)}>{p.label}</button>
                    ))}
                  </div>
                  <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4} placeholder="Describe outfit..." />
                </div>
              ) : (
                <div className="input-group">
                  <div className="input-label"><span className="label-num">2</span>Product Photo</div>
                  <div className="upload-zone" onClick={() => productInputRef.current?.click()}>
                    {productPreviewUrl ? <img src={productPreviewUrl} className="upload-preview" /> : <div className="upload-placeholder">Upload Product</div>}
                    <input type="file" ref={productInputRef} onChange={handleProductFileChange} hidden />
                  </div>
                </div>
              )}

              <div className="input-group">
                <div className="input-label"><span className="label-num">3</span>Size</div>
                <div className="size-options">
                  {SIZE_OPTIONS.map(s => (
                    <button key={s.value} type="button" className={`size-btn ${selectedSize === s.value ? 'active' : ''}`} onClick={() => setSelectedSize(s.value)}>{s.label}</button>
                  ))}
                </div>
              </div>

              <button type="submit" className="submit-btn" disabled={loading}>
                {loading ? 'Processing...' : 'Generate Try-On'}
              </button>
            </form>
          </aside>

          <section className="glass-card result-card">
            <div className="result-header"><h2>Result Preview</h2></div>
            <div className="result-display-area">
              {tryOnResult ? (
                <div className="result-image-wrapper">
                  <img src={tryOnResult} className="final-image" />
                  {combinedDescription && <div className="body-description combined"><h4>AI Analysis</h4><p>{combinedDescription}</p></div>}
                </div>
              ) : (
                <div className="empty-state">
                  {loading ? <div className="orb-loader"><div className="orb" /><div className="ring" /></div> : <p>Ready for generation</p>}
                </div>
              )}
            </div>
            {tryOnResult && <div className="result-actions"><button onClick={handleReset} className="reset-btn">Reset</button></div>}
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
