
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { 
  Upload, 
  X, 
  Zap, 
  Wand2, 
  Moon,
  Sun,
  Sparkles,
  Trash2,
  Download,
  RefreshCw,
  Rocket,
  Image as ImageIcon
} from 'lucide-react';
import { AspectRatio, GeneratedImage, ThemeMode, MODEL_IDS } from './types';

// --- IndexedDB Helpers (Banco de Dados Blindado) ---
const DB_NAME = 'ImaginarioStudioDB';
const STORE_NAME = 'images';
const DB_VERSION = 1;

const initDB = (): Promise<IDBDatabase | null> => {
  return new Promise((resolve) => {
    if (!window.indexedDB) {
      console.warn("IndexedDB não suportado, usando memória RAM.");
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      // Tratamento silencioso de erros de acesso (comum em iframes/modo privado)
      request.onerror = (e) => {
        console.warn("Acesso ao DB bloqueado (provavelmente restrição de segurança).", e);
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
      console.warn("Exceção crítica ao abrir DB:", e);
      resolve(null);
    }
  });
};

const saveImageToDB = async (image: GeneratedImage) => {
  try {
    const db = await initDB();
    if (!db) return null; // Falha silenciosa, apenas não salva no histórico persistente
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
        // Ordenar do mais recente para o mais antigo
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
  THEME: '100k_pro_theme_v1',
  TURBO: '100k_pro_turbo_v1',
  MAGIC: '100k_pro_magic_v1'
};

// "CONSCIÊNCIA" DE QUALIDADE E PERSONAGENS:
// Adicionamos 'official art' e 'canonical design' para garantir que personagens 
// famosos sejam gerados exatamente como são, sem alucinações de cores ou roupas.
const QUALITY_MODIFIERS = " . official art, canonical design, accurate character features, exact costume details, correct colors, symmetrical face, detailed eyes, 8k resolution, photorealistic, masterpiece, cinematic lighting, HDR, sharp focus, unreal engine 5 render";

// --- Main Component ---

const App: React.FC = () => {
  // --- State ---
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => 
    (localStorage.getItem(STORAGE_KEYS.THEME) as ThemeMode) || 'dark'
  );
  const [isTurboMode, setIsTurboMode] = useState(() => 
    localStorage.getItem(STORAGE_KEYS.TURBO) === 'true'
  );
  const [isMagicPrompt, setIsMagicPrompt] = useState(() => 
    localStorage.getItem(STORAGE_KEYS.MAGIC) === 'true'
  );

  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.WIDE_PORTRAIT); // Default iPhone Fullscreen
  const [referenceImage, setReferenceImage] = useState<{ file: File, preview: string, base64: string } | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');

  // --- Effects ---
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.THEME, themeMode); }, [themeMode]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.TURBO, String(isTurboMode)); }, [isTurboMode]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.MAGIC, String(isMagicPrompt)); }, [isMagicPrompt]);

  useEffect(() => {
    // Carrega imagens, mas não falha se der erro
    getImagesFromDB().then(images => {
      if (images.length > 0) setGeneratedImages(images);
    });
  }, []);

  // --- Styles (Mobile First / iPhone Aesthetic) ---
  const getThemeClasses = () => {
    const isDark = themeMode === 'dark';
    return {
      bg: isDark ? 'bg-slate-950' : 'bg-slate-50',
      card: isDark ? 'bg-slate-900' : 'bg-white',
      text: isDark ? 'text-white' : 'text-slate-900',
      subText: isDark ? 'text-slate-400' : 'text-slate-500',
      border: isDark ? 'border-white/10' : 'border-black/5',
      input: isDark ? 'bg-slate-800/50 text-white' : 'bg-slate-100 text-slate-900',
      glass: isDark ? 'backdrop-blur-xl bg-slate-950/80' : 'backdrop-blur-xl bg-white/80',
      buttonIcon: isDark ? 'text-slate-300' : 'text-slate-600'
    };
  };
  const theme = getThemeClasses();

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

  // A "Consciência" (AI) para reescrever o prompt com foco em personagens
  const enhancePromptAI = async (inputPrompt: string): Promise<string> => {
    try {
      // Assume que a API_KEY está disponível no ambiente
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `You are an expert visual director. Transform this user request into a detailed image generation prompt in English. 
        CRITICAL: If the user mentions a specific character (from anime, games, movies, or public figures), you MUST explicitly describe their official canonical appearance (hair color, eye shape, costume details, accessories) to ensure the image generator creates them perfectly without errors.
        Keep the style: Realism, 8k, Cinematic.
        User Request: "${inputPrompt}"`,
      });
      return response.text || inputPrompt;
    } catch (e) {
      // Se falhar a API de texto, retorna o prompt original para não travar
      return inputPrompt;
    }
  };

  const generateImage = async () => {
    if (!prompt.trim()) return;
    
    // Removed manual API Key check. Assuming process.env.API_KEY is valid.

    setIsGenerating(true);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      let finalPrompt = prompt;

      // LÓGICA DE CONSCIÊNCIA E VELOCIDADE
      if (isTurboMode) {
         setGenerationStatus('⚡ Gerando Ultra Rápido...');
         // No modo Turbo, injetamos diretamente os modificadores sem passar pelo LLM de texto para ganhar 2-3 segundos
         finalPrompt = prompt + QUALITY_MODIFIERS; 
      } else if (isMagicPrompt) {
         setGenerationStatus('✨ Consultando Personagem...');
         // No modo Magic, a IA reescreve o prompt para garantir a fidelidade do personagem
         const enhanced = await enhancePromptAI(prompt);
         finalPrompt = enhanced + QUALITY_MODIFIERS;
      } else {
         setGenerationStatus('🎨 Criando...');
         finalPrompt = prompt + QUALITY_MODIFIERS;
      }

      let imageUrl = '';
      let usedModel = '';

      // Injeção de formato para garantir conformidade visual
      const ratioText = ` aspect ratio ${aspectRatio.replace(':', ' by ')}`;

      if (isTurboMode || referenceImage) {
        // MODO VELOCIDADE MAXIMA (Gemini Flash Image)
        usedModel = MODEL_IDS.FAST_REFERENCE;
        const promptWithRatio = finalPrompt + " . " + ratioText;
        
        const parts: any[] = [{ text: promptWithRatio }];
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
           throw new Error("O modelo rápido não retornou imagem. Tente novamente.");
        }

      } else {
        // MODO QUALIDADE MAXIMA (Imagen 4)
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
             throw new Error("O modelo de alta qualidade não retornou imagem.");
           }
        } catch (err) {
           console.warn("Fallback to Flash", err);
           usedModel = 'gemini-2.5-flash-image (backup)';
           const promptWithRatio = finalPrompt + " . " + ratioText;
           const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash-image',
              contents: { parts: [{ text: promptWithRatio }] },
              config: { responseModalities: [Modality.IMAGE] }
           });
           const imgPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
           if (imgPart?.inlineData) {
             imageUrl = `data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`;
           }
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
        // Salvar no DB (se disponível) ou apenas no estado (se DB falhar)
        await saveImageToDB(newImage);
        setGeneratedImages(prev => [newImage, ...prev]);
      }
      
    } catch (error: any) {
      console.error(error);
      // Mensagem de erro amigável para o usuário
      alert(`Não foi possível gerar a imagem. Detalhe: ${error.message || 'Erro desconhecido'}`);
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

  return (
    <div className={`min-h-screen w-full transition-colors duration-300 ${theme.bg} ${theme.text} font-sans`}>
      
      {/* CONTAINER MOBILE */}
      <div className="max-w-[480px] mx-auto min-h-screen shadow-2xl flex flex-col relative border-x border-white/5">

        {/* HEADER */}
        <header className={`flex items-center justify-between px-5 py-4 sticky top-0 z-50 ${theme.glass} border-b ${theme.border}`}>
          <div className="flex items-center gap-2">
             <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Sparkles className="text-white w-4 h-4" />
             </div>
             <span className="font-bold text-lg tracking-tight">Imaginário</span>
          </div>
          <div className="flex gap-2">
             <button onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')} className={`p-2 rounded-full transition-colors active:scale-90 ${theme.card} border ${theme.border}`}>
               {themeMode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
             </button>
          </div>
        </header>

        {/* CORPO PRINCIPAL */}
        <div className="px-4 pt-6 pb-32 space-y-6">
          
          {/* ÁREA DE INPUT */}
          <div className="relative group">
            <textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Digite o nome de um personagem ou descreva uma cena... (Ex: Goku Super Saiyajin)"
              className={`w-full h-36 rounded-[2rem] p-5 text-base leading-relaxed resize-none outline-none shadow-inner transition-all ${theme.input} placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500/50 border border-transparent focus:border-blue-500/20`}
            />
            
            {/* Botão de Upload de Referência */}
            <div className="absolute bottom-3 left-3">
               {referenceImage ? (
                  <div className="flex items-center gap-2 bg-blue-500 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg animate-in zoom-in">
                    <ImageIcon size={12} />
                    <span>Imagem Ref</span>
                    <button onClick={(e) => { e.stopPropagation(); setReferenceImage(null); }} className="hover:text-red-200"><X size={12}/></button>
                  </div>
               ) : (
                  <label className={`p-2 rounded-full cursor-pointer hover:scale-110 transition-transform flex items-center justify-center ${theme.card} border ${theme.border} shadow-sm`}>
                      <Upload size={18} className="text-blue-500" />
                      <input type="file" accept="image/*" className="hidden" onChange={handleReferenceImageUpload} />
                  </label>
               )}
            </div>
            
            {/* Indicador de Caracteres */}
            <div className={`absolute bottom-4 right-5 text-xs font-medium ${theme.subText}`}>
               {prompt.length} chars
            </div>
          </div>

          {/* TOGGLES DE MODO (TURBO & MAGIC) */}
          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={() => setIsTurboMode(!isTurboMode)}
              className={`py-3.5 rounded-2xl border text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-all duration-300 active:scale-95 ${isTurboMode ? 'bg-yellow-500 text-white border-yellow-500 shadow-lg shadow-yellow-500/20' : `${theme.card} ${theme.border} ${theme.subText}`}`}
            >
              <Zap size={16} className={isTurboMode ? "fill-white" : ""} />
              Modo Turbo
            </button>
            <button 
              onClick={() => setIsMagicPrompt(!isMagicPrompt)}
              className={`py-3.5 rounded-2xl border text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-all duration-300 active:scale-95 ${isMagicPrompt ? 'bg-purple-600 text-white border-purple-600 shadow-lg shadow-purple-600/20' : `${theme.card} ${theme.border} ${theme.subText}`}`}
            >
              <Wand2 size={16} className={isMagicPrompt ? "fill-white" : ""} />
              Personagem Fiel
            </button>
          </div>

          {/* SELETOR DE FORMATO */}
          <div className="space-y-2">
             <label className={`text-[10px] font-bold uppercase tracking-widest ml-1 ${theme.subText}`}>Formato da Tela</label>
             <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                {[AspectRatio.WIDE_PORTRAIT, AspectRatio.PORTRAIT, AspectRatio.SQUARE, AspectRatio.LANDSCAPE, AspectRatio.WIDE_LANDSCAPE].map((ratio) => (
                  <button
                    key={ratio}
                    onClick={() => setAspectRatio(ratio)}
                    className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all whitespace-nowrap active:scale-95
                      ${aspectRatio === ratio 
                        ? `bg-white text-black border-white shadow-lg` 
                        : `${theme.card} ${theme.border} ${theme.subText} hover:border-slate-500`
                      }`}
                  >
                    {ratio.replace(':', ' : ')}
                  </button>
                ))}
             </div>
          </div>

          {/* FEED DE IMAGENS */}
          <div className="space-y-6 pt-2">
            
            {/* Botão de Gerar */}
             <button
                onClick={generateImage}
                disabled={isGenerating || !prompt.trim()}
                className={`w-full py-4 rounded-[20px] font-bold text-base text-white shadow-xl transform transition-all active:scale-[0.98] disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:shadow-blue-500/30 overflow-hidden relative group`}
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="animate-spin" size={20} />
                    <span>{generationStatus}</span>
                  </>
                ) : (
                  <>
                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 blur-xl rounded-[20px]"></div>
                    <Rocket size={20} className="group-hover:-translate-y-1 transition-transform duration-300" />
                    <span>CRIAR ARTE</span>
                  </>
                )}
              </button>

              {/* LISTA DE IMAGENS */}
              {generatedImages.length > 0 && (
                  <div className="flex flex-col gap-6 animate-in fade-in duration-700 slide-in-from-bottom-4">
                    {generatedImages.map((img) => (
                        <div key={img.id} className="w-full flex flex-col gap-3">
                            {/* O Container da Imagem respeita a ratio estritamente */}
                            <div className={`w-full relative rounded-3xl overflow-hidden shadow-2xl border ${theme.border} bg-black group ${getAspectRatioClass(img.aspectRatio)}`}>
                                <img 
                                    src={img.url} 
                                    alt="AI Art"
                                    loading="lazy"
                                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                />
                                {/* Overlay de Ações */}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-4 backdrop-blur-[2px]">
                                    <button 
                                        onClick={() => handleDownload(img.url, img.id)}
                                        className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 transition-transform shadow-lg"
                                    >
                                        <Download size={20} />
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteImage(img.id)}
                                        className="w-12 h-12 rounded-full bg-red-500 text-white flex items-center justify-center hover:scale-110 transition-transform shadow-lg"
                                    >
                                        <Trash2 size={20} />
                                    </button>
                                </div>
                            </div>
                            
                            {/* Info abaixo da imagem */}
                            <div className="px-2 flex justify-between items-start">
                                <p className={`text-xs font-medium leading-relaxed line-clamp-2 max-w-[75%] ${theme.subText}`}>
                                    {img.prompt}
                                </p>
                                <span className="text-[10px] font-bold uppercase bg-white/5 px-2 py-1 rounded text-slate-400">
                                    {img.aspectRatio}
                                </span>
                            </div>
                        </div>
                    ))}
                  </div>
              )}

              {generatedImages.length === 0 && !isGenerating && (
                <div className="py-10 text-center opacity-40">
                    <p className="text-sm">Sua galeria aparecerá aqui.</p>
                </div>
              )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default App;
