
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { 
  Upload, 
  X, 
  Zap, 
  Wand2, 
  Sparkles,
  Trash2,
  Download,
  RefreshCw,
  Rocket,
  Image as ImageIcon,
  AlertTriangle,
  Aperture
} from 'lucide-react';
import { AspectRatio, GeneratedImage, MODEL_IDS } from './types';

// --- IndexedDB Helpers (Banco de Dados Blindado) ---
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
      
      request.onerror = (e) => {
        console.warn("DB Access blocked", e);
        resolve(null); 
      };

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
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(image);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    return null;
  }
};

const getImagesFromDB = async (): Promise<GeneratedImage[]> => {
  try {
    const db = await initDB();
    if (!db) return [];
    return new Promise((resolve, reject) => {
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
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    return [];
  }
};

const deleteFromDB = async (id: string) => {
   try {
    const db = await initDB();
    if (!db) return;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
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
  TURBO: '100k_pro_turbo_v1',
  MAGIC: '100k_pro_magic_v1'
};

const QUALITY_MODIFIERS = " . highly detailed, 8k, official art, canonical design, masterpiece, photorealistic, cinematic lighting, sharp focus, vivid colors";

// --- Main Component ---

const App: React.FC = () => {
  // --- State ---
  // Theme mode removed: Always Dark/Black
  const [isTurboMode, setIsTurboMode] = useState(() => 
    localStorage.getItem(STORAGE_KEYS.TURBO) === 'true'
  );
  const [isMagicPrompt, setIsMagicPrompt] = useState(() => 
    localStorage.getItem(STORAGE_KEYS.MAGIC) === 'true'
  );

  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.WIDE_PORTRAIT);
  const [referenceImage, setReferenceImage] = useState<{ file: File, preview: string, base64: string } | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // --- Effects ---
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.TURBO, String(isTurboMode)); }, [isTurboMode]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.MAGIC, String(isMagicPrompt)); }, [isMagicPrompt]);

  useEffect(() => {
    getImagesFromDB().then(images => {
      if (images.length > 0) setGeneratedImages(images);
    });
  }, []);

  // --- Handlers ---

  const handleReferenceImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const preview = await fileToDataUrl(file);
        const base64 = await fileToBase64(file);
        setReferenceImage({ file, preview, base64 });
      } catch (e) {
        console.error("Err ref img", e);
      }
    }
  };

  const handleDeleteImage = async (id: string) => {
      await deleteFromDB(id);
      setGeneratedImages(prev => prev.filter(img => img.id !== id));
  };

  const enhancePromptAI = async (inputPrompt: string): Promise<string> => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) return inputPrompt;

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `You are an expert visual director. Improve this prompt for an image generator.
        User Request: "${inputPrompt}"
        Rules:
        1. If it contains a character name, describe their canonical appearance (hair, eyes, outfit) in detail.
        2. Keep it concise but descriptive.
        3. Style: High quality, 8k, Cinematic.
        4. Return ONLY the prompt text.`,
      });
      return response.text || inputPrompt;
    } catch (e) {
      return inputPrompt;
    }
  };

  const generateImage = async () => {
    if (!prompt.trim()) return;
    
    setIsGenerating(true);
    setGenerationStatus('Iniciando...');
    setErrorMsg(null);
    
    // Obtém a chave silenciosamente do ambiente
    const apiKey = process.env.API_KEY || '';
    
    try {
      const ai = new GoogleGenAI({ apiKey });
      let finalPrompt = prompt;

      // 1. Otimização do Prompt
      if (!isTurboMode && isMagicPrompt) {
         setGenerationStatus('✨ Otimizando Prompt...');
         finalPrompt = await enhancePromptAI(prompt);
      }
      
      // Adiciona modificadores globais
      finalPrompt += QUALITY_MODIFIERS;

      let imageUrl = '';
      let usedModel = '';
      
      const ratioText = ` . aspect ratio ${aspectRatio.replace(':', ' by ')}`;

      // 2. Lógica de Geração
      if (isTurboMode || referenceImage) {
        // === MODO RÁPIDO / COM REFERÊNCIA ===
        setGenerationStatus('⚡ Gerando (Flash)...');
        usedModel = MODEL_IDS.FAST_REFERENCE;
        
        const parts: any[] = [{ text: finalPrompt + ratioText }];
        
        if (referenceImage) {
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
           throw new Error("Não foi possível gerar a imagem com o modelo Rápido.");
        }

      } else {
        // === MODO ALTA QUALIDADE (IMAGEN 4) ===
        setGenerationStatus('🎨 Renderizando (Imagen 4)...');
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
             throw new Error("No image data returned from Imagen.");
           }
        } catch (imagenError: any) {
           console.warn("Fallback to Flash caused by:", imagenError);
           setGenerationStatus('⚠️ Alternando para backup...');
           usedModel = 'gemini-2.5-flash-image (backup)';
           
           const backupResponse = await ai.models.generateContent({
              model: 'gemini-2.5-flash-image',
              contents: { parts: [{ text: finalPrompt + ratioText }] },
              config: { responseModalities: [Modality.IMAGE] }
           });
           
           const imgPart = backupResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
           if (imgPart?.inlineData) {
             imageUrl = `data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`;
           } else {
             throw new Error("Falha na geração. Tente simplificar seu pedido.");
           }
        }
      }

      // 3. Sucesso - Salvar
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
        saveImageToDB(newImage);
      }
      
    } catch (error: any) {
      console.error("Generation Error:", error);
      let msg = "Erro ao gerar imagem.";
      
      if (error.message) {
          if (error.message.includes('API key')) msg = "Chave API não encontrada. Verifique suas configurações.";
          else if (error.message.includes('SAFETY')) msg = "Conteúdo bloqueado por filtros de segurança.";
          else if (error.message.includes('429')) msg = "Muitas requisições. Aguarde um momento.";
          else msg = error.message;
      }
      
      setErrorMsg(msg);
    } finally {
      setIsGenerating(false);
      setGenerationStatus('');
    }
  };

  const getAspectRatioClass = (ratio: string) => {
    switch(ratio) {
      case '1:1': return 'aspect-square';
      case '3:4': return 'aspect-[3/4]';
      case '4:3': return 'aspect-[4/3]';
      case '9:16': return 'aspect-[9/16]';
      case '16:9': return 'aspect-[16/9]';
      default: return 'aspect-square';
    }
  };

  const handleDownload = (url: string, id: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `imaginario-${id}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Design System Colors - "Modern Black"
  const design = {
    bg: 'bg-black', // Pure black
    card: 'bg-[#09090b]', // Zinc 950
    cardHover: 'hover:bg-[#18181b]', // Zinc 900
    border: 'border-white/10',
    activeBorder: 'border-white/20',
    input: 'bg-[#09090b] text-white placeholder-zinc-500',
    accent: 'text-purple-400',
    primaryGradient: 'bg-gradient-to-r from-violet-600 to-indigo-600',
    glass: 'backdrop-blur-xl bg-black/60',
  };

  return (
    <div className={`min-h-screen w-full ${design.bg} text-zinc-200 font-sans selection:bg-purple-500/30`}>
      
      {/* Background Ambient Light (Subtle) */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full h-[500px] max-w-[800px] bg-violet-900/20 blur-[120px] rounded-full pointer-events-none z-0" />

      {/* CONTAINER MOBILE */}
      <div className="max-w-[480px] mx-auto min-h-screen relative border-x border-white/5 bg-black shadow-[0_0_50px_rgba(0,0,0,0.8)] z-10">

        {/* HEADER */}
        <header className={`flex items-center justify-between px-6 py-5 sticky top-0 z-50 ${design.glass} border-b ${design.border}`}>
          <div className="flex items-center gap-3">
             <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-[0_0_15px_rgba(139,92,246,0.3)]">
                <Aperture className="text-white w-5 h-5" />
             </div>
             <div className="flex flex-col">
                <span className="font-bold text-base tracking-wide text-white leading-none">IMAGINÁRIO</span>
                <span className="text-[10px] font-medium text-zinc-500 tracking-widest uppercase mt-0.5">AI Studio</span>
             </div>
          </div>
          <div className="flex gap-2">
            {/* Indicator dot just for aesthetics */}
             <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)] animate-pulse"></div>
          </div>
        </header>

        {/* CORPO PRINCIPAL */}
        <div className="px-5 pt-6 pb-40 space-y-7">
          
          {/* ÁREA DE INPUT */}
          <div className="relative group">
            <div className={`absolute -inset-0.5 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-[26px] opacity-20 group-focus-within:opacity-60 blur transition duration-500`}></div>
            <textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Imagine algo incrível..."
              className={`relative w-full h-40 rounded-[24px] p-6 text-[15px] leading-relaxed resize-none outline-none transition-all duration-300 ${design.input} focus:bg-[#0e0e11] shadow-inner`}
            />
            
            {/* Botão de Upload de Referência */}
            <div className="absolute bottom-4 left-4 z-10">
               {referenceImage ? (
                  <div className="flex items-center gap-2 bg-zinc-800 text-zinc-200 border border-white/10 px-3 py-1.5 rounded-full text-xs font-semibold animate-in zoom-in">
                    <div className="w-4 h-4 overflow-hidden rounded-full">
                       <img src={referenceImage.preview} className="w-full h-full object-cover" alt="ref" />
                    </div>
                    <span>Ref</span>
                    <button onClick={(e) => { e.stopPropagation(); setReferenceImage(null); }} className="hover:text-white ml-1"><X size={12}/></button>
                  </div>
               ) : (
                  <label className={`p-2.5 rounded-full cursor-pointer hover:bg-zinc-800 transition-colors flex items-center justify-center bg-black/50 border border-white/5 hover:border-white/20 backdrop-blur-sm group/upload`}>
                      <Upload size={16} className="text-zinc-400 group-hover/upload:text-white transition-colors" />
                      <input type="file" accept="image/*" className="hidden" onChange={handleReferenceImageUpload} />
                  </label>
               )}
            </div>
            
            {/* Indicador de Caracteres */}
            <div className="absolute bottom-5 right-6 text-[10px] font-bold text-zinc-600 z-10">
               {prompt.length} CHARS
            </div>
          </div>

          {/* TOGGLES DE MODO (TURBO & MAGIC) */}
          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={() => setIsTurboMode(!isTurboMode)}
              className={`py-4 rounded-2xl border text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-300 active:scale-95
                ${isTurboMode 
                  ? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.1)]' 
                  : 'bg-[#09090b] border-white/5 text-zinc-500 hover:bg-zinc-900 hover:border-white/10'}`}
            >
              <Zap size={14} className={isTurboMode ? "fill-yellow-400" : ""} />
              Turbo
            </button>
            <button 
              onClick={() => setIsMagicPrompt(!isMagicPrompt)}
              className={`py-4 rounded-2xl border text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-300 active:scale-95
                ${isMagicPrompt 
                  ? 'bg-purple-500/10 border-purple-500/50 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.1)]' 
                  : 'bg-[#09090b] border-white/5 text-zinc-500 hover:bg-zinc-900 hover:border-white/10'}`}
            >
              <Wand2 size={14} className={isMagicPrompt ? "fill-purple-400" : ""} />
              Magic AI
            </button>
          </div>

          {/* SELETOR DE FORMATO */}
          <div className="space-y-3">
             <label className="text-[10px] font-bold uppercase tracking-widest ml-1 text-zinc-500">Aspect Ratio</label>
             <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar mask-linear-fade">
                {[AspectRatio.WIDE_PORTRAIT, AspectRatio.PORTRAIT, AspectRatio.SQUARE, AspectRatio.LANDSCAPE, AspectRatio.WIDE_LANDSCAPE].map((ratio) => (
                  <button
                    key={ratio}
                    onClick={() => setAspectRatio(ratio)}
                    className={`flex-shrink-0 px-4 py-3 rounded-xl text-[11px] font-bold border transition-all whitespace-nowrap active:scale-95
                      ${aspectRatio === ratio 
                        ? 'bg-zinc-100 text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.1)]' 
                        : 'bg-[#09090b] border-white/5 text-zinc-500 hover:bg-zinc-900 hover:border-white/10'
                      }`}
                  >
                    {ratio}
                  </button>
                ))}
             </div>
          </div>

          {/* BOTÃO GERAR E ERROS */}
          <div className="space-y-3 pt-2">
               <button
                  onClick={generateImage}
                  disabled={isGenerating || !prompt.trim()}
                  className={`w-full py-5 rounded-[24px] font-bold text-[15px] tracking-wide text-white shadow-2xl transform transition-all active:scale-[0.98] disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-3 ${design.primaryGradient} hover:shadow-violet-500/25 overflow-hidden relative group`}
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="animate-spin text-white/80" size={20} />
                      <span className="text-white/90 animate-pulse">{generationStatus}</span>
                    </>
                  ) : (
                    <>
                      <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500 blur-2xl"></div>
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 duration-700 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/10 to-transparent"></div>
                      <Rocket size={20} className="group-hover:-translate-y-1 transition-transform duration-300 relative z-10" />
                      <span className="relative z-10">GERAR ARTE</span>
                    </>
                  )}
                </button>
                
                {errorMsg && (
                  <div className="flex items-center gap-3 text-xs text-red-400 bg-red-950/20 p-4 rounded-xl border border-red-500/20 animate-in fade-in slide-in-from-top-2">
                    <AlertTriangle size={16} className="flex-shrink-0" />
                    <span className="font-medium">{errorMsg}</span>
                  </div>
                )}
          </div>

          {/* FEED DE IMAGENS */}
          <div className="space-y-8 pt-4">
              {generatedImages.length > 0 ? (
                  <div className="flex flex-col gap-8 animate-in fade-in duration-700">
                    {generatedImages.map((img) => (
                        <div key={img.id} className="w-full flex flex-col gap-3 group/card">
                            
                            {/* Card da Imagem */}
                            <div className={`w-full relative rounded-[32px] overflow-hidden border border-white/10 bg-[#09090b] shadow-2xl ${getAspectRatioClass(img.aspectRatio)}`}>
                                <img 
                                    src={img.url} 
                                    alt="AI Art"
                                    loading="lazy"
                                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover/card:scale-105"
                                />
                                
                                {/* Gradiente inferior para leitura de texto se necessário, ou apenas estético */}
                                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent opacity-60" />

                                {/* Overlay de Ações */}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-4 backdrop-blur-sm">
                                    <button 
                                        onClick={() => handleDownload(img.url, img.id)}
                                        className="w-14 h-14 rounded-2xl bg-white text-black flex items-center justify-center hover:scale-110 hover:bg-violet-100 transition-all shadow-lg"
                                    >
                                        <Download size={24} strokeWidth={2} />
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteImage(img.id)}
                                        className="w-14 h-14 rounded-2xl bg-zinc-900 text-red-500 border border-red-500/30 flex items-center justify-center hover:scale-110 hover:bg-red-950/50 transition-all shadow-lg"
                                    >
                                        <Trash2 size={24} strokeWidth={2} />
                                    </button>
                                </div>
                            </div>
                            
                            {/* Metadados */}
                            <div className="px-2 flex justify-between items-center">
                                <div className="flex flex-col gap-1 max-w-[70%]">
                                  <p className="text-[13px] text-zinc-300 font-medium leading-snug line-clamp-1 group-hover/card:text-white transition-colors">
                                      {img.prompt}
                                  </p>
                                  <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-bold">
                                    {new Date(img.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                  </span>
                                </div>
                                <span className={`text-[9px] font-bold uppercase px-2.5 py-1 rounded-md border border-white/5 tracking-wider
                                  ${img.model === MODEL_IDS.HIGH_QUALITY ? 'bg-violet-500/10 text-violet-400 border-violet-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'}
                                `}>
                                    {img.model === MODEL_IDS.HIGH_QUALITY ? 'HQ IMAGEN' : 'FLASH'}
                                </span>
                            </div>
                        </div>
                    ))}
                  </div>
              ) : !isGenerating && (
                <div className="py-20 flex flex-col items-center justify-center gap-4 opacity-30">
                    <div className="w-20 h-20 rounded-full bg-zinc-900 flex items-center justify-center border border-white/5">
                      <Sparkles className="text-zinc-500" size={32} />
                    </div>
                    <p className="text-sm font-medium tracking-wide text-zinc-500 uppercase">Aguardando comando</p>
                </div>
              )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default App;
