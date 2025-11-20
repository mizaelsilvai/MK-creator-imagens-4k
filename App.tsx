
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { 
  Upload, X, Zap, Wand2, Sparkles, Trash2, Download, 
  RefreshCw, Rocket, Image as ImageIcon, AlertTriangle, 
  Flame, Activity, Settings, Key, Check, ShieldAlert, 
  Smartphone, Monitor, Layers, Edit3, Type, Sticker, Palette
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

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};

// --- Constants ---
const STORAGE_KEYS = {
  TURBO: 'imaginario_turbo_mode',
  MAGIC: 'imaginario_magic_prompt',
  API_KEY: 'imaginario_custom_api_key'
};

const QUALITY_MODIFIERS = " . hyper-maximalist masterpiece, 8k UHD, intricate details, complex geometric patterns, volumetric cinematic lighting, unreal engine 5 render, sharp focus, rich textures, vivid deep colors, award winning photography, ray tracing, global illumination";

// Estilos Pré-definidos
const STYLES = {
  FREE: { label: 'Prompt', icon: <Edit3 size={18} />, prompt: "" },
  STICKER: { label: 'Figura', icon: <Sticker size={18} />, prompt: " . die-cut sticker, vector art, cute, white border, flat color, simple shading, isolated on white background" },
  LOGO: { label: 'Logo', icon: <Type size={18} />, prompt: " . minimalist logo design, vector graphics, flat design, geometric shapes, professional brand identity, isolated" },
  COMIC: { label: 'Desenho', icon: <Palette size={18} />, prompt: " . comic book style, halftone patterns, vibrant colors, bold outlines, graphic novel aesthetic, action dynamic" },
};

type StyleKey = keyof typeof STYLES;
type Mode = 'create' | 'edit';

const App: React.FC = () => {
  // --- State ---
  const [activeMode, setActiveMode] = useState<Mode>('create');
  const [selectedStyle, setSelectedStyle] = useState<StyleKey>('FREE');
  
  const [isTurboMode, setIsTurboMode] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.TURBO);
    return stored !== null ? stored === 'true' : true; 
  });
  const [userApiKey, setUserApiKey] = useState(() => 
    localStorage.getItem(STORAGE_KEYS.API_KEY) || ''
  );
  
  const [showSettings, setShowSettings] = useState(false);
  const [tempKey, setTempKey] = useState('');
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.WIDE_PORTRAIT);
  const [referenceImage, setReferenceImage] = useState<{ file: File, preview: string, base64: string } | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

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

  // Reset reference image when switching modes if needed, or keep it
  useEffect(() => {
    if (activeMode === 'create') {
      // Optional: Clear reference when going to create mode? 
      // Let's keep it flexible, but 'Edit' implies using a reference.
    }
  }, [activeMode]);

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

  const handleReferenceImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const preview = await fileToDataUrl(file);
        const base64 = await fileToBase64(file);
        setReferenceImage({ file, preview, base64 });
        // Se o usuário fez upload, vamos supor que ele quer "editar" ou usar referência
        if (activeMode === 'create') setActiveMode('edit');
      } catch (e) {
        console.error("Err ref img", e);
      }
    }
  };

  const handleDeleteImage = async (id: string) => {
      await deleteFromDB(id);
      const remaining = generatedImages.filter(img => img.id !== id);
      setGeneratedImages(remaining);
      if (selectedImageId === id) {
        setSelectedImageId(remaining[0]?.id || null);
      }
  };

  const generateImage = async () => {
    if (!prompt.trim()) return;
    
    const apiKey = userApiKey || process.env.API_KEY;
    if (!apiKey) {
      setErrorMsg("Configuração Necessária: Chave API ausente.");
      setShowSettings(true);
      return;
    }

    setIsGenerating(true);
    setGenerationStatus('Inicializando...');
    setErrorMsg(null);
    
    try {
      const ai = new GoogleGenAI({ apiKey });
      
      // Combinar prompt do usuário com o estilo selecionado
      let finalPrompt = prompt + STYLES[selectedStyle].prompt + QUALITY_MODIFIERS;

      // Lógica de seleção de modelo
      // Se estamos em modo EDIT (com imagem) ou Turbo -> Flash
      // Se estamos em modo CREATE (sem imagem) e formato específico -> Imagen HQ
      
      const isSquare = aspectRatio === AspectRatio.SQUARE;
      const hasReference = !!referenceImage;
      
      // Força Imagen HQ se não tiver referência E (não for quadrado OU não estiver em modo turbo)
      // Nota: Imagen 4 é o único que faz 16:9 / 9:16 nativo de alta qualidade sem distorção
      const forceHqForQuality = !hasReference && (!isTurboMode || !isSquare);
      
      // Se tiver referência, SOMENTE o Flash suporta image-to-image via API atualmente de forma fácil
      // (Imagen 3/4 image-to-image é via Vertex AI, aqui estamos usando @google/genai studio wrapper)
      const useFlash = !forceHqForQuality || hasReference;

      let imageUrl = '';
      let usedModel = '';

      if (useFlash) {
        setGenerationStatus(hasReference ? '🎨 Editando Imagem...' : '⚡ Gerando (Turbo)...');
        usedModel = MODEL_IDS.FAST_REFERENCE;
        
        const ratioPrompt = `Aspect ratio ${aspectRatio.replace(':', ' by ')} . `;
        const combinedPrompt = ratioPrompt + finalPrompt;

        const parts: any[] = [{ text: combinedPrompt }];
        
        if (hasReference && activeMode === 'edit') {
          parts.unshift({
            inlineData: {
              data: referenceImage.base64,
              mimeType: referenceImage.file.type
            }
          });
        }

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: { parts },
          config: { responseModalities: [Modality.IMAGE] }
        });

        const imgPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (imgPart?.inlineData) {
          imageUrl = `data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`;
        } else {
           throw new Error("O modelo não retornou imagem.");
        }

      } else {
        setGenerationStatus('🖌️ Renderizando HQ...');
        usedModel = MODEL_IDS.HIGH_QUALITY;
        
        try {
           const response = await ai.models.generateImages({
              model: 'imagen-4.0-generate-001',
              prompt: finalPrompt, 
              config: {
                numberOfImages: 1,
                aspectRatio: aspectRatio as any,
                outputMimeType: 'image/jpeg'
              }
           });
           
           const b64 = response.generatedImages?.[0]?.image?.imageBytes;
           if (b64) {
             imageUrl = `data:image/jpeg;base64,${b64}`;
           } else {
             throw new Error("Sem resposta do modelo HQ.");
           }
        } catch (imagenError) {
           console.warn("Fallback executado");
           setGenerationStatus('⚠️ Fallback Turbo...');
           usedModel = 'gemini-2.5-flash-image (fallback)';
           const ratioPrompt = `Aspect ratio ${aspectRatio.replace(':', ' by ')} . `;
           const backupResponse = await ai.models.generateContent({
              model: 'gemini-2.5-flash-image',
              contents: { parts: [{ text: ratioPrompt + finalPrompt }] },
              config: { responseModalities: [Modality.IMAGE] }
           });
           const imgPart = backupResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
           if (imgPart?.inlineData) imageUrl = `data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`;
        }
      }

      if (imageUrl) {
        const newImage: GeneratedImage = {
          id: Date.now().toString(),
          url: imageUrl,
          prompt: prompt,
          aspectRatio,
          model: usedModel,
          createdAt: Date.now(),
          referenceImage: referenceImage ? referenceImage.preview : undefined
        };
        setGeneratedImages(prev => [newImage, ...prev]);
        setSelectedImageId(newImage.id);
        saveImageToDB(newImage);
      }
      
    } catch (error: any) {
      console.error(error);
      setErrorMsg("Falha na geração. Verifique sua chave API ou simplifique o prompt.");
    } finally {
      setIsGenerating(false);
      setGenerationStatus('');
    }
  };

  const activeApiKey = userApiKey || process.env.API_KEY;
  const selectedImage = generatedImages.find(img => img.id === selectedImageId);

  return (
    <div className="flex h-screen bg-black text-zinc-200 font-sans overflow-hidden selection:bg-red-500/30">
      
      {/* === SETTINGS MODAL === */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
           <div className="w-full max-w-md bg-[#0c0c0e] border border-red-900/30 rounded-2xl shadow-2xl">
              <div className="p-6 space-y-4">
                 <div className="flex justify-between items-center border-b border-white/5 pb-4">
                    <h3 className="font-bold text-white">Configurações</h3>
                    <button onClick={() => setShowSettings(false)}><X size={20} className="text-zinc-500 hover:text-white" /></button>
                 </div>
                 <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-400 flex items-center gap-2"><Key size={12} /> API KEY</label>
                    <input 
                       type="password" value={tempKey} onChange={(e) => setTempKey(e.target.value)}
                       placeholder="Cole sua chave aqui..."
                       className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-red-500 outline-none"
                    />
                    <p className="text-[10px] text-zinc-600">Deixe vazio para usar a chave padrão do sistema.</p>
                 </div>
                 <button onClick={handleSaveSettings} className="w-full py-3 rounded-xl bg-white text-black font-bold text-sm hover:bg-zinc-200">SALVAR</button>
              </div>
           </div>
        </div>
      )}

      {/* === LEFT PANEL (CONTROLS) === */}
      <aside className="w-[400px] flex-shrink-0 border-r border-white/5 bg-[#050505] flex flex-col h-full relative z-10">
        
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-black/50 backdrop-blur-md">
           <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-600 to-rose-900 flex items-center justify-center shadow-[0_0_15px_rgba(220,38,38,0.4)]">
                 <Flame className="text-white w-4 h-4 fill-white" />
              </div>
              <div>
                 <h1 className="font-bold text-sm tracking-wide text-white">IMAGINÁRIO</h1>
                 <p className="text-[10px] text-red-500 font-medium tracking-widest uppercase">Studio Pro</p>
              </div>
           </div>
           <button onClick={handleOpenSettings} className={`p-2 rounded-full hover:bg-white/5 transition-colors ${!activeApiKey ? 'text-red-500 animate-pulse' : 'text-zinc-600'}`}>
             <Settings size={16} />
           </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
           
           {/* 1. Mode Toggle */}
           <div className="p-1 bg-zinc-900/50 rounded-xl flex border border-white/5">
              <button 
                onClick={() => setActiveMode('create')}
                className={`flex-1 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${activeMode === 'create' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                Criar
              </button>
              <button 
                onClick={() => setActiveMode('edit')}
                className={`flex-1 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${activeMode === 'edit' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                Editar
              </button>
           </div>

           {/* 2. Prompt Section */}
           <div className="space-y-3">
              <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider ml-1">
                 {activeMode === 'create' ? 'Descreva sua Ideia' : 'Instruções de Edição'}
              </label>
              <div className="relative group">
                 <div className="absolute -inset-0.5 bg-gradient-to-r from-red-600/50 to-rose-600/50 rounded-2xl opacity-0 group-focus-within:opacity-100 blur transition duration-500"></div>
                 <textarea 
                   value={prompt}
                   onChange={(e) => setPrompt(e.target.value)}
                   placeholder={activeMode === 'create' ? "Ex: Um samurai cibernético em neon..." : "Ex: Mude o fundo para uma floresta vermelha..."}
                   className="relative w-full h-32 bg-[#09090b] rounded-xl p-4 text-sm text-white placeholder-zinc-600 outline-none resize-none border border-white/10 focus:border-transparent transition-all"
                 />
              </div>
           </div>

           {/* 3. Functions / Styles Grid */}
           {activeMode === 'create' && (
             <div className="space-y-3">
                <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider ml-1">Estilo</label>
                <div className="grid grid-cols-2 gap-2">
                   {(Object.keys(STYLES) as StyleKey[]).map((key) => (
                     <button
                       key={key}
                       onClick={() => setSelectedStyle(key)}
                       className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left group
                         ${selectedStyle === key 
                           ? 'bg-red-900/10 border-red-500/50 text-white' 
                           : 'bg-[#09090b] border-white/5 text-zinc-500 hover:border-white/10 hover:bg-zinc-900'}`}
                     >
                        <div className={`p-2 rounded-lg ${selectedStyle === key ? 'bg-red-500 text-white' : 'bg-zinc-800 text-zinc-400 group-hover:text-zinc-200'}`}>
                           {STYLES[key].icon}
                        </div>
                        <span className="text-xs font-medium">{STYLES[key].label}</span>
                     </button>
                   ))}
                </div>
             </div>
           )}

           {/* 4. Reference Image (Dual/Single Upload Logic) */}
           {(activeMode === 'edit' || referenceImage) && (
             <div className="space-y-3 animate-in fade-in slide-in-from-left-4">
                <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider ml-1 flex justify-between">
                   <span>Imagem de Referência</span>
                   {activeMode === 'edit' && <span className="text-red-500 text-[9px]">Obrigatório</span>}
                </label>
                
                {referenceImage ? (
                   <div className="relative w-full h-40 bg-zinc-900 rounded-xl overflow-hidden border border-white/10 group">
                      <img src={referenceImage.preview} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" alt="ref" />
                      <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-sm">
                         <button onClick={() => setReferenceImage(null)} className="p-2 bg-red-600 rounded-lg text-white hover:scale-110 transition-transform">
                            <Trash2 size={16} />
                         </button>
                      </div>
                      <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 rounded text-[10px] font-mono text-white backdrop-blur">
                        REF
                      </div>
                   </div>
                ) : (
                   <label className="block w-full h-32 border-2 border-dashed border-white/10 rounded-xl hover:border-red-500/50 hover:bg-red-900/5 transition-all cursor-pointer flex flex-col items-center justify-center gap-2 group">
                      <div className="p-3 bg-zinc-900 rounded-full group-hover:scale-110 transition-transform">
                        <Upload size={20} className="text-zinc-500 group-hover:text-red-500" />
                      </div>
                      <span className="text-xs text-zinc-500 font-medium">Clique para enviar</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleReferenceImageUpload} />
                   </label>
                )}
             </div>
           )}

           {/* 5. Aspect Ratio & Turbo */}
           <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider ml-1">Formato & Modelo</label>
                <button 
                  onClick={() => setIsTurboMode(!isTurboMode)}
                  className={`text-[10px] font-bold px-2 py-1 rounded border flex items-center gap-1 transition-colors
                    ${isTurboMode ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 'bg-zinc-800 text-zinc-500 border-white/5'}`}
                >
                   <Zap size={10} className={isTurboMode ? "fill-orange-400" : ""} />
                   {isTurboMode ? 'TURBO ON' : 'TURBO OFF'}
                </button>
              </div>
              
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                 {[AspectRatio.SQUARE, AspectRatio.PORTRAIT, AspectRatio.LANDSCAPE, AspectRatio.WIDE_PORTRAIT, AspectRatio.WIDE_LANDSCAPE].map(ratio => (
                    <button 
                      key={ratio}
                      onClick={() => setAspectRatio(ratio)}
                      className={`px-3 py-2 rounded-lg border text-[10px] font-bold flex-shrink-0 transition-all
                        ${aspectRatio === ratio ? 'bg-white text-black border-white' : 'bg-zinc-900 text-zinc-500 border-white/5 hover:bg-zinc-800'}`}
                    >
                       {ratio}
                    </button>
                 ))}
              </div>
           </div>

        </div>

        {/* Footer Action */}
        <div className="p-6 border-t border-white/5 bg-[#050505]">
           <button
             onClick={generateImage}
             disabled={isGenerating || !prompt.trim() || (activeMode === 'edit' && !referenceImage)}
             className={`w-full py-4 rounded-xl font-bold text-sm tracking-wider text-white shadow-2xl transform transition-all active:scale-[0.98] disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-2 bg-gradient-to-r from-red-600 to-rose-800 hover:shadow-red-500/20 relative overflow-hidden group`}
           >
              {isGenerating ? (
                 <>
                   <RefreshCw className="animate-spin" size={18} />
                   <span className="animate-pulse">{generationStatus}</span>
                 </>
              ) : (
                 <>
                   <span className="relative z-10 flex items-center gap-2">
                      <Rocket size={18} className="group-hover:-translate-y-0.5 transition-transform" />
                      GERAR IMAGEM
                   </span>
                   <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500 blur-xl"></div>
                 </>
              )}
           </button>
           {errorMsg && <p className="text-red-500 text-[10px] mt-3 text-center bg-red-950/20 py-2 rounded border border-red-500/20">{errorMsg}</p>}
        </div>
      </aside>

      {/* === RIGHT PANEL (PREVIEW & GALLERY) === */}
      <main className="flex-1 flex flex-col bg-black relative">
         {/* Background Ambient */}
         <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-red-900/10 via-black to-black pointer-events-none"></div>

         {/* Main Preview Area */}
         <div className="flex-1 flex items-center justify-center p-10 relative overflow-hidden">
            {selectedImage ? (
               <div className="relative max-w-full max-h-full flex flex-col items-center animate-in zoom-in-95 duration-500">
                  <div className={`relative rounded-sm shadow-[0_0_100px_rgba(0,0,0,0.8)] border border-white/10 bg-zinc-900 overflow-hidden group`}>
                     <img 
                       src={selectedImage.url} 
                       alt="Main Preview"
                       className="max-h-[80vh] max-w-full object-contain"
                     />
                     <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex justify-center gap-4">
                        <button 
                          onClick={() => { 
                             const link = document.createElement('a'); 
                             link.href = selectedImage.url; 
                             link.download = `imaginario-${selectedImage.id}.png`;
                             link.click(); 
                          }}
                          className="px-6 py-3 bg-white text-black rounded-full font-bold text-xs hover:scale-105 transition-transform flex items-center gap-2"
                        >
                           <Download size={16} /> BAIXAR 4K
                        </button>
                        <button 
                          onClick={() => handleDeleteImage(selectedImage.id)}
                          className="px-6 py-3 bg-red-600/20 backdrop-blur border border-red-500/30 text-red-500 rounded-full font-bold text-xs hover:bg-red-600 hover:text-white transition-all flex items-center gap-2"
                        >
                           <Trash2 size={16} /> DELETAR
                        </button>
                     </div>
                  </div>
                  <div className="mt-4 flex items-center gap-3 opacity-60 hover:opacity-100 transition-opacity">
                     <span className="text-xs text-zinc-400 font-mono max-w-md truncate">{selectedImage.prompt}</span>
                     <span className="text-[10px] px-2 py-0.5 border border-white/10 rounded text-zinc-500 uppercase">{selectedImage.model.includes('flash') ? 'Turbo' : 'HQ'}</span>
                  </div>
               </div>
            ) : (
               <div className="flex flex-col items-center justify-center gap-4 opacity-20">
                  <div className="w-32 h-32 rounded-full border border-white/10 bg-zinc-900/50 flex items-center justify-center">
                     <Sparkles size={48} className="text-zinc-500" />
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight text-zinc-700 uppercase">Aguardando Criação</h2>
               </div>
            )}
         </div>

         {/* Bottom Gallery Strip */}
         <div className="h-32 bg-[#050505] border-t border-white/5 p-4 flex items-center gap-4 overflow-x-auto custom-scrollbar z-20">
            {generatedImages.map((img) => (
               <button 
                 key={img.id}
                 onClick={() => setSelectedImageId(img.id)}
                 className={`flex-shrink-0 h-24 aspect-square rounded-lg overflow-hidden border-2 transition-all relative group ${selectedImageId === img.id ? 'border-red-600 ring-4 ring-red-600/10 scale-105' : 'border-transparent hover:border-zinc-600 opacity-60 hover:opacity-100'}`}
               >
                  <img src={img.url} className="w-full h-full object-cover" alt="thumb" />
                  {img.model.includes('imagen') && (
                     <div className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full shadow-lg"></div>
                  )}
               </button>
            ))}
         </div>

      </main>
    </div>
  );
};

export default App;
