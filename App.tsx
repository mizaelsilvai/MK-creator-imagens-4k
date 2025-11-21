
import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Upload, X, Zap, Wand2, Sparkles, Trash2, Download, 
  RefreshCw, Rocket, Image as ImageIcon, AlertTriangle, 
  Flame, Activity, Settings, Key, Check, ShieldAlert, 
  Smartphone, Monitor, Layers, Edit3, Type, Sticker, Palette,
  History, LayoutGrid, Camera, Box, Maximize2, CheckCircle2
} from 'lucide-react';
import { AspectRatio, GeneratedImage, MODEL_IDS } from './types';

// --- IndexedDB Helpers ---
const DB_NAME = 'ImaginarioStudioDB';
const STORE_NAME = 'images';
const DB_VERSION = 1;

const initDB = (): Promise<IDBDatabase | null> => {
  return new Promise((resolve) => {
    if (!window.indexedDB) {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => resolve(null);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
    } catch (e) {
      resolve(null);
    }
  });
};

const saveImageToDB = async (image: GeneratedImage) => {
  try {
    const db = await initDB();
    if (!db) return null;
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put(image);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
    });
  } catch (e) {
    return null;
  }
};

const getImagesFromDB = async (): Promise<GeneratedImage[]> => {
  try {
    const db = await initDB();
    if (!db) return [];
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const res = request.result as GeneratedImage[];
        if (res && Array.isArray(res)) {
            res.sort((a,b) => b.createdAt - a.createdAt);
            resolve(res);
        } else {
            resolve([]);
        }
      };
      request.onerror = () => resolve([]);
    });
  } catch (e) {
    return [];
  }
};

const deleteFromDB = async (id: string) => {
   try {
    const db = await initDB();
    if (!db) return;
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete(id);
  } catch (e) {
    console.error("Failed to delete item", e);
  }
}

// --- File Helpers ---
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const base64Data = reader.result.split(',')[1];
        resolve(base64Data);
      }
    };
    reader.onerror = error => reject(error);
  });
};

// --- Constants ---
const STORAGE_KEYS = {
  TURBO: 'imaginario_turbo_mode',
  MAGIC: 'imaginario_magic_prompt',
  API_KEY: 'imaginario_custom_api_key'
};

// Prompt Engineering Robusto - Focado em Realismo Extremo e Sem Marca D'água
const QUALITY_SUFFIX = " . masterpiece, best quality, 8k resolution, ultra-detailed, sharp focus, professional photography, cinematic lighting, hdr, 4k, 8k, raw photo, photorealistic, hyperrealistic, uncompressed, wallpaper, fujifilm xt3, skin texture, pore details, ray tracing";
const NEGATIVE_INSTRUCTION = " . IMPERATIVE: NO WATERMARK, NO TEXT, NO SIGNATURE, NO LOGO, NO COPYRIGHT. avoid: deformed, distorted, disfigured, bad anatomy, extra limbs, floating limbs, missing limbs, blurry, low quality, grain, ugly, tiling, poorly drawn hands, poorly drawn feet, poorly drawn face, out of frame, extra fingers, mutated hands, poorly drawn eyes, body out of frame, bad art, beginner, amateur, cut off, oversaturated, cartoon (unless specified)";

// Estilos Pré-definidos Otimizados
const STYLES = {
  REALISM: { label: 'Ultra Realista', icon: <Camera size={16} />, prompt: " . 35mm photograph, film, bokeh, professional, 4k, highly detailed, volumetric lighting, dramatic lighting, skin details, realistic texture, unreal engine 5 render style, natural lighting" },
  FREE: { label: 'Criativo', icon: <Edit3 size={16} />, prompt: " . creative, artistic, unique, detailed, vivid, atmospheric, detailed environment" },
  RENDER_3D: { label: '3D Cinema', icon: <Box size={16} />, prompt: " . 3d render, octane render, unreal engine 5, pixar style, ray tracing, global illumination, volumetric lighting, cgsociety" },
  STICKER: { label: 'Figura', icon: <Sticker size={16} />, prompt: " . die-cut sticker, vector art, cute, white border, flat color, simple shading, isolated on white background" },
  LOGO: { label: 'Logo Pro', icon: <Type size={16} />, prompt: " . minimalist logo design, vector graphics, flat design, geometric shapes, professional brand identity, isolated, clean lines, modern" },
  COMIC: { label: 'HQs', icon: <Palette size={16} />, prompt: " . comic book style, halftone patterns, vibrant colors, bold outlines, graphic novel aesthetic, action dynamic, ink lines, marvel style" },
};

type StyleKey = keyof typeof STYLES;

const App: React.FC = () => {
  // --- State ---
  const [selectedStyle, setSelectedStyle] = useState<StyleKey>('REALISM');
  
  const [isTurboMode, setIsTurboMode] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.TURBO);
    return stored !== null ? stored === 'true' : false; 
  });
  const [userApiKey, setUserApiKey] = useState(() => 
    localStorage.getItem(STORAGE_KEYS.API_KEY) || ''
  );
  
  const [showSettings, setShowSettings] = useState(false);
  const [tempKey, setTempKey] = useState('');
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.WIDE_PORTRAIT);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

  // Computed
  const selectedImage = generatedImages.find(img => img.id === selectedImageId);

  // --- Effects ---
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.TURBO, String(isTurboMode)); }, [isTurboMode]);

  useEffect(() => {
    getImagesFromDB().then(images => {
      if (images.length > 0) {
        setGeneratedImages(images);
        setSelectedImageId(images[0].id);
      }
    });
  }, []);

  // --- Handlers ---
  const handleOpenSettings = () => {
    setTempKey(userApiKey);
    setShowSettings(true);
  };

  const handleSaveSettings = () => {
    localStorage.setItem(STORAGE_KEYS.API_KEY, tempKey.trim());
    setUserApiKey(tempKey.trim());
    setShowSettings(false);
  };

  const handleDeleteImage = async (id: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (!confirm("Tem certeza que deseja excluir esta imagem permanentemente?")) return;

      await deleteFromDB(id);
      const remaining = generatedImages.filter(img => img.id !== id);
      setGeneratedImages(remaining);
      
      if (selectedImageId === id) {
        setSelectedImageId(remaining[0]?.id || null);
      }
  };

  const handleDownload = async (url: string, id: string) => {
    try {
      // Se for base64, baixa direto. Se for URL, fetch e blob.
      const isBase64 = url.startsWith('data:');
      let blobUrl = url;
      
      if (!isBase64) {
         const response = await fetch(url);
         const blob = await response.blob();
         blobUrl = window.URL.createObjectURL(blob);
      }
      
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `Imaginario_Studio_${id}_UltraHD.png`; // Nome profissional
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      if (!isBase64) window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Download failed", error);
      setErrorMsg("Erro ao iniciar download. Tente novamente.");
    }
  };

  const handleGenerate = async () => {
    const key = userApiKey || process.env.API_KEY;
    
    if (!key) {
      handleOpenSettings();
      setErrorMsg("Configuração Necessária: Insira sua API Key para iniciar.");
      return;
    }
    
    if (!prompt.trim()) {
      setErrorMsg("O prompt não pode estar vazio. Descreva sua ideia.");
      return;
    }

    setIsGenerating(true);
    setGenerationStatus(isTurboMode ? 'Processando com Gemini Flash (Alta Velocidade)...' : 'Renderizando com Imagen 4 (Qualidade Estúdio)...');
    setErrorMsg(null);

    try {
       const ai = new GoogleGenAI({ apiKey: key });
       
       const stylePrompt = STYLES[selectedStyle].prompt;
       // Concatena prompt do usuário + estilo + melhoria de qualidade + instrução negativa
       const fullPrompt = `${prompt}${stylePrompt}${QUALITY_SUFFIX}${NEGATIVE_INSTRUCTION}`;
       
       let imageUrl = '';
       const model = isTurboMode ? MODEL_IDS.FAST_REFERENCE : MODEL_IDS.HIGH_QUALITY;
       
       if (isTurboMode) {
          // Gemini 2.5 Flash Image
          // CRÍTICO: Passar imageConfig para garantir Aspect Ratio correto
          const response = await ai.models.generateContent({
            model: model,
            contents: {
              parts: [
                { text: fullPrompt }
              ]
            },
            config: {
               imageConfig: {
                 aspectRatio: aspectRatio, // Enforce aspect ratio here
               }
            }
          });
          
          const parts = response.candidates?.[0]?.content?.parts;
          if (parts) {
             for (const part of parts) {
                if (part.inlineData) {
                   imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                   break;
                }
             }
          }
       } else {
          // Imagen 4 (Alta Qualidade)
          // CRÍTICO: Imagen 4 usa parâmetros diferentes no config
          const response = await ai.models.generateImages({
             model: model,
             prompt: fullPrompt,
             config: {
               numberOfImages: 1,
               aspectRatio: aspectRatio, // Enforce aspect ratio here
               outputMimeType: 'image/png'
             }
          });
          
          const b64 = response.generatedImages?.[0]?.image?.imageBytes;
          if (b64) {
            imageUrl = `data:image/png;base64,${b64}`;
          }
       }
       
       if (!imageUrl) {
         throw new Error("O servidor não retornou dados de imagem. O prompt pode ter violado diretrizes de segurança.");
       }

       const newImage: GeneratedImage = {
         id: crypto.randomUUID(),
         url: imageUrl,
         prompt: prompt,
         aspectRatio: aspectRatio,
         model: isTurboMode ? 'Gemini Flash 2.5' : 'Imagen 4.0 (UHD)',
         createdAt: Date.now()
       };

       await saveImageToDB(newImage);
       setGeneratedImages(prev => [newImage, ...prev]);
       setSelectedImageId(newImage.id);

    } catch (error: any) {
       console.error(error);
       setErrorMsg(error.message || "Falha na geração. Verifique sua conexão e API Key.");
    } finally {
       setIsGenerating(false);
    }
  };

  return (
    <div className="flex h-screen bg-black text-zinc-200 overflow-hidden font-sans selection:bg-red-500/30">
      
      {/* --- LEFT SIDEBAR: INPUTS & GALLERY --- */}
      <div className="w-[420px] flex flex-col border-r border-zinc-800 bg-zinc-900/50 h-full flex-shrink-0 z-20 relative">
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          
          {/* App Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3 select-none">
              <div className="w-9 h-9 bg-gradient-to-br from-red-600 to-orange-600 rounded-lg flex items-center justify-center shadow-lg shadow-red-900/20">
                <Sparkles className="text-white w-5 h-5" />
              </div>
              <div>
                <h1 className="font-bold text-xl tracking-tight text-white leading-none">IMAGINÁRIO</h1>
                <span className="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase">AI Studio Pro</span>
              </div>
            </div>
            <button 
              onClick={handleOpenSettings}
              className="p-2.5 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 hover:text-white border border-transparent hover:border-zinc-700"
            >
              <Settings size={18} />
            </button>
          </div>

          {/* PROMPT INPUT */}
          <div className="space-y-3 mb-8">
            <div className="flex justify-between items-center">
               <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider ml-1">Prompt Criativo</label>
               <span className="text-[10px] text-zinc-600 bg-zinc-900 px-2 py-1 rounded border border-zinc-800">Seja detalhado</span>
            </div>
            <div className="relative group">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ex: Paisagem futurista de uma metrópole cyberpunk à noite, chuva caindo, reflexos neon no asfalto, atmosfera densa, ultra realista..."
                className="w-full h-36 bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-sm resize-none focus:ring-1 focus:ring-red-500 focus:border-red-500 outline-none transition-all placeholder:text-zinc-700 text-zinc-100 leading-relaxed shadow-inner"
              />
              <div className="absolute bottom-3 right-3 pointer-events-none">
                <Wand2 size={16} className="text-zinc-700 group-focus-within:text-red-500 transition-colors" />
              </div>
            </div>
          </div>

          {/* STYLES */}
          <div className="space-y-3 mb-8">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider ml-1">Estilo Visual</label>
            <div className="grid grid-cols-3 gap-2.5">
              {(Object.entries(STYLES) as [StyleKey, typeof STYLES[StyleKey]][]).map(([key, style]) => (
                <button
                  key={key}
                  onClick={() => setSelectedStyle(key)}
                  className={`flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl border transition-all duration-200 ${
                    selectedStyle === key
                      ? 'bg-zinc-800 border-red-500 text-white shadow-[0_0_20px_rgba(220,38,38,0.1)]'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:bg-zinc-900 hover:border-zinc-700 hover:text-zinc-300'
                  }`}
                >
                  <div className={selectedStyle === key ? 'text-red-500' : 'text-current opacity-70'}>
                    {style.icon}
                  </div>
                  <span className="text-[11px] font-semibold">
                    {style.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* QUALITY & ASPECT RATIO */}
          <div className="grid grid-cols-1 gap-8 mb-8">
            {/* Quality Selector */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider ml-1 flex items-center gap-2">
                <Activity size={12} /> Motor de Renderização
              </label>
              <div className="grid grid-cols-2 gap-1 bg-zinc-950 border border-zinc-800 p-1.5 rounded-xl">
                 <button 
                   onClick={() => setIsTurboMode(true)}
                   className={`flex flex-col items-center justify-center gap-1 py-3 px-3 rounded-lg text-xs font-medium transition-all border ${
                     isTurboMode 
                       ? 'bg-zinc-800 text-white border-zinc-700 shadow-sm' 
                       : 'text-zinc-500 border-transparent hover:text-zinc-300'
                   }`}
                 >
                   <div className="flex items-center gap-2">
                      <Zap size={14} className={isTurboMode ? "text-yellow-400" : ""} />
                      <span>Turbo Flash</span>
                   </div>
                   {isTurboMode && <span className="text-[9px] text-zinc-400">Rápido • Uso Geral</span>}
                 </button>
                 <button 
                   onClick={() => setIsTurboMode(false)}
                   className={`flex flex-col items-center justify-center gap-1 py-3 px-3 rounded-lg text-xs font-medium transition-all border ${
                     !isTurboMode 
                       ? 'bg-zinc-800 text-white border-zinc-700 shadow-sm' 
                       : 'text-zinc-500 border-transparent hover:text-zinc-300'
                   }`}
                 >
                   <div className="flex items-center gap-2">
                      <Sparkles size={14} className={!isTurboMode ? "text-blue-400" : ""} />
                      <span>Ultra HD (Pro)</span>
                   </div>
                   {!isTurboMode && <span className="text-[9px] text-zinc-400">Alta Fidelidade • Imagen 4</span>}
                 </button>
              </div>
            </div>

            {/* Aspect Ratio */}
            <div className="space-y-3">
               <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider ml-1 flex items-center gap-2">
                <Maximize2 size={12} /> Formato da Tela
              </label>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {[
                  { label: '1:1', desc: 'Quadrado', icon: <div className="w-4 h-4 border-2 border-current rounded-[1px]" />, value: AspectRatio.SQUARE },
                  { label: '9:16', desc: 'Stories', icon: <div className="w-3 h-5 border-2 border-current rounded-[1px]" />, value: AspectRatio.WIDE_PORTRAIT },
                  { label: '16:9', desc: 'Cinema', icon: <div className="w-5 h-3 border-2 border-current rounded-[1px]" />, value: AspectRatio.WIDE_LANDSCAPE },
                  { label: '3:4', desc: 'Retrato', icon: <div className="w-3 h-4 border-2 border-current rounded-[1px]" />, value: AspectRatio.PORTRAIT },
                ].map((ratio) => (
                  <button
                    key={ratio.label}
                    onClick={() => setAspectRatio(ratio.value)}
                    className={`flex-shrink-0 min-w-[80px] px-3 py-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                      aspectRatio === ratio.value
                        ? 'bg-zinc-800 border-zinc-600 text-white'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                    }`}
                  >
                    {ratio.icon}
                    <span className="text-[10px] font-bold">{ratio.label}</span>
                    <span className="text-[9px] font-normal opacity-60">{ratio.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* GENERATE BUTTON */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`w-full py-4 rounded-xl font-bold text-sm tracking-wide transition-all duration-300 flex items-center justify-center gap-2 shadow-lg transform active:scale-[0.98] ${
              isGenerating
                ? 'bg-zinc-800 cursor-not-allowed text-zinc-500 border border-zinc-700'
                : 'bg-white text-black hover:bg-zinc-200 shadow-red-900/10'
            }`}
          >
            {isGenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                PROCESSANDO...
              </>
            ) : (
              <>
                <Rocket size={18} className="text-red-600" />
                CRIAR IMAGEM AGORA
              </>
            )}
          </button>

          {/* Status Message */}
          {errorMsg && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 text-xs text-red-300">
              <ShieldAlert size={16} className="mt-0.5 flex-shrink-0 text-red-500" />
              <span className="leading-relaxed">{errorMsg}</span>
            </div>
          )}
          
          {isGenerating && (
            <div className="mt-4 text-center">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 animate-pulse">{generationStatus}</p>
            </div>
          )}

          {/* --- GALLERY GRID --- */}
          <div className="mt-12 border-t border-zinc-800 pt-8">
             <h3 className="text-xs font-bold text-zinc-500 mb-5 uppercase tracking-wider flex items-center gap-2">
                <History size={14} /> Histórico de Criações
             </h3>
             
             {generatedImages.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-12 text-zinc-700 border-2 border-dashed border-zinc-900 rounded-2xl bg-zinc-950/50">
                 <ImageIcon size={32} className="mb-3 opacity-30" />
                 <span className="text-xs font-medium">Sua galeria aparecerá aqui</span>
               </div>
             ) : (
               <div className="grid grid-cols-2 gap-3 pb-24">
                  {generatedImages.map((img) => (
                    <div 
                      key={img.id}
                      onClick={() => setSelectedImageId(img.id)}
                      className={`group relative aspect-square rounded-xl overflow-hidden cursor-pointer border transition-all ${
                        selectedImageId === img.id 
                          ? 'border-white ring-1 ring-white/20 z-10 shadow-xl' 
                          : 'border-zinc-800 hover:border-zinc-600 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img 
                        src={img.url} 
                        alt="thumbnail" 
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                        loading="lazy"
                      />
                      {/* Overlay on Hover */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                      
                      <button
                        onClick={(e) => handleDeleteImage(img.id, e)}
                        className="absolute top-1 right-1 p-1.5 bg-black/60 hover:bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all transform scale-90 group-hover:scale-100 backdrop-blur-sm"
                      >
                        <Trash2 size={12} />
                      </button>
                      
                      {/* Badge */}
                      <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/70 backdrop-blur-sm rounded-md text-[9px] font-bold text-white/90 flex items-center gap-1">
                         {img.model.includes('Flash') ? <Zap size={8} className="text-yellow-400"/> : <Sparkles size={8} className="text-blue-400"/>}
                         {img.aspectRatio}
                      </div>
                    </div>
                  ))}
               </div>
             )}
          </div>
        </div>
      </div>

      {/* --- RIGHT AREA: MAIN PREVIEW --- */}
      <div className="flex-1 flex flex-col relative bg-black h-full">
        
        {/* Main Image Canvas */}
        <div className="flex-1 flex items-center justify-center p-10 overflow-hidden relative">
          {/* Background Grid Pattern */}
          <div className="absolute inset-0 opacity-[0.08]" 
               style={{ 
                 backgroundImage: 'linear-gradient(to right, #333 1px, transparent 1px), linear-gradient(to bottom, #333 1px, transparent 1px)', 
                 backgroundSize: '40px 40px' 
               }}>
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/50 pointer-events-none" />

          {selectedImage ? (
            <div className="relative z-10 max-w-full max-h-full shadow-[0_0_50px_rgba(0,0,0,0.8)] rounded-sm group">
              <img 
                src={selectedImage.url} 
                alt="Selected generation" 
                className="max-w-full max-h-[calc(100vh-140px)] object-contain rounded-sm shadow-2xl"
              />
              
              {/* Image Actions Bar (Floating) */}
              <div className="absolute -bottom-16 left-1/2 transform -translate-x-1/2 flex items-center gap-3 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 p-2 rounded-2xl shadow-2xl transition-all duration-300 opacity-100">
                 
                 <div className="px-4 flex flex-col border-r border-zinc-700/50 pr-4 mr-1">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Resolução</span>
                    <span className="text-xs text-white font-medium flex items-center gap-1">
                       {selectedImage.model.includes('Imagen') ? 'Full HD / 4K' : 'HD Standard'}
                       <CheckCircle2 size={10} className="text-green-500" />
                    </span>
                 </div>

                 <button 
                    onClick={() => handleDeleteImage(selectedImage.id)}
                    className="p-3 hover:bg-red-500/20 text-zinc-400 hover:text-red-500 rounded-xl transition-colors"
                    title="Excluir"
                  >
                    <Trash2 size={20} />
                  </button>
                  
                  <div className="h-8 w-[1px] bg-zinc-700/50 mx-1"></div>

                  <button 
                    onClick={() => handleDownload(selectedImage.url, selectedImage.id)}
                    className="py-2.5 px-6 bg-white hover:bg-zinc-200 text-black rounded-xl shadow-lg transition-transform active:scale-95 flex items-center gap-2"
                  >
                    <Download size={18} />
                    <div className="flex flex-col items-start leading-none">
                      <span className="font-bold text-xs">BAIXAR ORIGINAL</span>
                      <span className="text-[9px] opacity-60">PNG • Sem Perda</span>
                    </div>
                  </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center text-zinc-800 animate-pulse select-none">
               <div className="w-32 h-32 rounded-full border-2 border-dashed border-zinc-900 flex items-center justify-center mb-6">
                 <Sparkles size={48} className="opacity-20" />
               </div>
               <h2 className="text-xl font-bold text-zinc-800">IMAGINÁRIO STUDIO</h2>
               <p className="text-sm font-medium mt-2">Selecione um formato e crie sua arte</p>
            </div>
          )}
        </div>

      </div>

      {/* --- SETTINGS MODAL --- */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-md p-8 shadow-2xl relative">
            <button 
              onClick={() => setShowSettings(false)}
              className="absolute top-5 right-5 text-zinc-500 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
            
            <h2 className="text-xl font-bold text-white mb-8 flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <Settings className="text-red-500" size={20} />
              </div>
              Configurações do Sistema
            </h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase mb-3">Google Gemini API Key</label>
                <div className="relative group">
                  <Key className="absolute left-4 top-3.5 text-zinc-600 group-focus-within:text-white transition-colors" size={16} />
                  <input 
                    type="password" 
                    value={tempKey}
                    onChange={(e) => setTempKey(e.target.value)}
                    placeholder="Cole sua chave AIzaSy aqui..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 pl-12 pr-4 text-sm text-white focus:ring-2 focus:ring-red-500/50 focus:border-transparent outline-none transition-all"
                  />
                </div>
                <p className="text-[10px] text-zinc-500 mt-3 leading-relaxed">
                  Para gerar imagens de alta qualidade (Imagen 4) sem erros, você precisa de uma chave válida com permissões no Google AI Studio. A chave é salva apenas no seu dispositivo.
                </p>
              </div>
            </div>

            <div className="mt-10 flex gap-3">
              <button 
                onClick={() => setShowSettings(false)}
                className="flex-1 py-3 rounded-xl bg-zinc-900 text-zinc-400 text-sm font-bold hover:bg-zinc-800 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveSettings}
                className="flex-1 py-3 rounded-xl bg-white text-black text-sm font-bold hover:bg-zinc-200 transition-colors shadow-lg"
              >
                Salvar e Conectar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
