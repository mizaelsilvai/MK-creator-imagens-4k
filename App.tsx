
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
  Flame,
  Activity,
  Settings,
  Key,
  Check,
  ShieldAlert,
  Smartphone,
  Monitor
} from 'lucide-react';
import { AspectRatio, GeneratedImage, MODEL_IDS } from './types';

// --- IndexedDB Helpers (Banco de Dados Local) ---
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

// Chave padrão injetada conforme solicitação do usuário
const PROVIDED_KEY = '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';

// Modificadores extremos para complexidade visual e alta fidelidade
const QUALITY_MODIFIERS = " . hyper-maximalist masterpiece, 8k UHD, intricate details, complex geometric patterns, volumetric cinematic lighting, unreal engine 5 render, sharp focus, rich textures, vivid deep colors, award winning photography, ray tracing, global illumination";

const App: React.FC = () => {
  // --- State ---
  // Default to Turbo (Fast) mode for better user experience unless changed
  const [isTurboMode, setIsTurboMode] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.TURBO);
    return stored !== null ? stored === 'true' : true; 
  });
  const [isMagicPrompt, setIsMagicPrompt] = useState(() => 
    localStorage.getItem(STORAGE_KEYS.MAGIC) === 'true'
  );

  // Inicializa com a chave salva OU a chave fornecida (PROVIDED_KEY)
  const [userApiKey, setUserApiKey] = useState(() => 
    localStorage.getItem(STORAGE_KEYS.API_KEY) || PROVIDED_KEY
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

  // --- Effects ---
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.TURBO, String(isTurboMode)); }, [isTurboMode]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.MAGIC, String(isMagicPrompt)); }, [isMagicPrompt]);

  useEffect(() => {
    getImagesFromDB().then(images => {
      if (images.length > 0) setGeneratedImages(images);
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

  const enhancePromptAI = async (inputPrompt: string, ai: GoogleGenAI): Promise<string> => {
    try {
      // Solicita uma descrição mais complexa e artística
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Rewrite this image prompt to be extremely descriptive, focusing on complex details, lighting, and artistic composition. Make it sophisticated. Input: "${inputPrompt}"`,
      });
      return response.text || inputPrompt;
    } catch (e) {
      return inputPrompt; // Fail gracefully
    }
  };

  const generateImage = async () => {
    if (!prompt.trim()) return;
    
    // Prioriza a chave do usuário, depois tenta a do ambiente
    const apiKey = userApiKey || process.env.API_KEY;

    if (!apiKey) {
      setErrorMsg("Configuração Necessária: Chave API ausente. Clique na engrenagem para configurar.");
      setShowSettings(true);
      return;
    }

    setIsGenerating(true);
    setGenerationStatus('Inicializando...');
    setErrorMsg(null);
    
    try {
      const ai = new GoogleGenAI({ apiKey });
      
      let finalPrompt = prompt;

      // 1. Magic Prompt (Se ativado ou prompt curto, aumenta a complexidade)
      if ((isMagicPrompt || prompt.length < 30) && !referenceImage) {
         setGenerationStatus('✨ Maximizando Complexidade...');
         finalPrompt = await enhancePromptAI(prompt, ai);
      }
      
      // Adiciona sufixos de alta fidelidade
      finalPrompt += QUALITY_MODIFIERS;

      let imageUrl = '';
      let usedModel = '';

      // LÓGICA DE SELEÇÃO DE MODELO E FORMATO
      // Gemini Flash Image (Turbo) gera nativamente 1:1 (Quadrado).
      // Para garantir formatos como 9:16 ou 16:9, usamos o Imagen 4.
      // Se o usuário tiver uma imagem de referência, usamos Flash (pela API atual).

      const isSquare = aspectRatio === AspectRatio.SQUARE;
      const hasReference = !!referenceImage;
      
      // Forçamos HQ se o usuário quer um formato específico (não quadrado) E não está usando referência
      // Isso garante que o 9:16 seja realmente 9:16
      const forceHqForAspectRatio = !isSquare && !hasReference;
      
      const useFlash = (isTurboMode && !forceHqForAspectRatio) || hasReference;

      if (useFlash) {
        setGenerationStatus('⚡ Gerando (Turbo)...');
        usedModel = MODEL_IDS.FAST_REFERENCE;
        
        // Colocamos o Aspect Ratio no começo para tentar forçar o modelo Flash, caso seja usado
        const ratioPrompt = `Aspect ratio ${aspectRatio.replace(':', ' by ')} . `;
        const combinedPrompt = ratioPrompt + finalPrompt;

        const parts: any[] = [{ text: combinedPrompt }];
        
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
           throw new Error("O modelo não retornou dados de imagem.");
        }

      } else {
        // Modo High Quality (Imagen) - Garante o formato 9:16, 16:9, etc.
        const statusMsg = forceHqForAspectRatio ? '📐 Ajustando Formato 9:16/16:9...' : '🎨 Renderizando Alta Fidelidade...';
        setGenerationStatus(statusMsg);
        usedModel = MODEL_IDS.HIGH_QUALITY;
        
        try {
           const response = await ai.models.generateImages({
              model: 'imagen-4.0-generate-001',
              prompt: finalPrompt, 
              config: {
                numberOfImages: 1,
                aspectRatio: aspectRatio as any, // Passa o formato exato (ex: '9:16')
                outputMimeType: 'image/jpeg'
              }
           });
           
           const b64 = response.generatedImages?.[0]?.image?.imageBytes;
           if (b64) {
             imageUrl = `data:image/jpeg;base64,${b64}`;
           } else {
             throw new Error("Sem resposta do modelo HQ.");
           }
        } catch (imagenError: any) {
           // Fallback automático para Flash
           console.warn("Fallback executado:", imagenError);
           setGenerationStatus('⚠️ Alternando para Turbo (Fallback)...');
           usedModel = 'gemini-2.5-flash-image (fallback)';
           
           const ratioPrompt = `Aspect ratio ${aspectRatio.replace(':', ' by ')} . `;
           const backupResponse = await ai.models.generateContent({
              model: 'gemini-2.5-flash-image',
              contents: { parts: [{ text: ratioPrompt + finalPrompt }] },
              config: { responseModalities: [Modality.IMAGE] }
           });
           
           const imgPart = backupResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
           if (imgPart?.inlineData) {
             imageUrl = `data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`;
           } else {
             throw new Error("Falha na geração. Tente simplificar o prompt ou verificar sua chave API.");
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
        
        setGeneratedImages(prev => [newImage, ...prev]);
        saveImageToDB(newImage);
      }
      
    } catch (error: any) {
      console.error("Erro de Geração:", error);
      let msg = "Ocorreu um erro inesperado na comunicação com a API.";
      
      if (error.message) {
          if (error.message.includes('SAFETY')) msg = "Conteúdo bloqueado pelos filtros de segurança. Tente um prompt diferente.";
          else if (error.message.includes('429')) msg = "Muitas requisições. Aguarde alguns segundos.";
          else if (error.message.includes('403') || error.message.includes('API key') || error.message.includes('401') || error.message.includes('fetch failed')) msg = "Erro de Chave API: Verifique se sua chave está correta nas Configurações.";
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

  // Design System Colors - "Red & Black"
  const design = {
    bg: 'bg-black', 
    card: 'bg-[#09090b]',
    input: 'bg-[#09090b] text-white placeholder-zinc-600',
    primaryGradient: 'bg-gradient-to-r from-red-600 to-rose-700',
    glass: 'backdrop-blur-xl bg-black/60',
  };

  const activeApiKey = userApiKey || process.env.API_KEY;
  const isSquare = aspectRatio === AspectRatio.SQUARE;

  return (
    <div className={`min-h-screen w-full ${design.bg} text-zinc-200 font-sans selection:bg-red-500/30`}>
      
      {/* Background Ambient Light */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full h-[600px] max-w-[1000px] bg-red-900/20 blur-[130px] rounded-full pointer-events-none z-0" />

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="w-full max-w-md bg-[#0c0c0e] border border-red-900/30 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden">
              <div className="p-6 space-y-6 relative">
                 {/* Header Modal */}
                 <div className="flex justify-between items-center border-b border-white/5 pb-4">
                    <div className="flex items-center gap-3">
                       <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                          <Settings className="text-red-500" size={20} />
                       </div>
                       <div>
                          <h3 className="font-bold text-white text-lg">Configuração do Sistema</h3>
                          <p className="text-xs text-zinc-500 uppercase tracking-wider">Credenciais de Acesso</p>
                       </div>
                    </div>
                    <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                       <X size={20} className="text-zinc-500" />
                    </button>
                 </div>

                 {/* Body Modal */}
                 <div className="space-y-4">
                    <div className="space-y-2">
                       <label className="text-xs font-bold text-zinc-400 ml-1 flex items-center gap-2">
                          <Key size={12} />
                          API KEY (Cole sua chave aqui)
                       </label>
                       <div className="relative group">
                          <input 
                             type="password"
                             value={tempKey}
                             onChange={(e) => setTempKey(e.target.value)}
                             placeholder="sk-..."
                             className="w-full bg-black border border-white/10 rounded-xl px-4 py-3.5 text-sm text-white focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition-all placeholder:text-zinc-700"
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                             {tempKey ? <Check size={14} className="text-green-500" /> : <ShieldAlert size={14} className="text-zinc-700" />}
                          </div>
                       </div>
                       <p className="text-[10px] text-zinc-600 leading-relaxed px-1">
                          A chave fornecida já está carregada. Se desejar alterar, cole a nova chave aqui. Ela será salva localmente.
                       </p>
                    </div>
                 </div>

                 {/* Footer Modal */}
                 <div className="pt-2">
                    <button 
                      onClick={handleSaveSettings}
                      className="w-full py-3.5 rounded-xl bg-zinc-100 text-black font-bold text-sm hover:bg-white hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-white/5"
                    >
                       SALVAR E CONTINUAR
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* CONTAINER */}
      <div className="max-w-[480px] mx-auto min-h-screen relative border-x border-white/5 bg-black shadow-[0_0_60px_rgba(0,0,0,0.9)] z-10">

        {/* HEADER */}
        <header className={`flex items-center justify-between px-6 py-5 sticky top-0 z-50 ${design.glass} border-b border-white/5`}>
          <div className="flex items-center gap-3">
             <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center shadow-[0_0_15px_rgba(220,38,38,0.3)]">
                <Flame className="text-white w-5 h-5 fill-white" />
             </div>
             <div className="flex flex-col">
                <span className="font-bold text-base tracking-wide text-white leading-none">IMAGINÁRIO</span>
                <span className="text-[10px] font-medium text-red-500 tracking-widest uppercase mt-0.5">Red Edition</span>
             </div>
          </div>
          <div className="flex items-center gap-3">
            {activeApiKey ? (
               <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-900/20 border border-green-500/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)] animate-pulse"></div>
                  <span className="text-[9px] font-bold text-green-500 tracking-wider uppercase">Pronto</span>
               </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-900/20 border border-red-500/20 animate-pulse">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                  <span className="text-[9px] font-bold text-red-500 tracking-wider uppercase">Sem Chave</span>
               </div>
            )}
            <button 
              onClick={handleOpenSettings} 
              className={`w-8 h-8 rounded-full bg-zinc-900 border flex items-center justify-center hover:bg-zinc-800 transition-all group ${!activeApiKey ? 'border-red-500 animate-bounce' : 'border-white/5'}`}
            >
               <Settings size={14} className={`text-zinc-500 group-hover:text-white transition-colors group-hover:rotate-90 duration-500 ${!activeApiKey ? 'text-red-500' : ''}`} />
            </button>
          </div>
        </header>

        {/* CORPO PRINCIPAL */}
        <div className="px-5 pt-6 pb-40 space-y-7">
          
          {/* ÁREA DE INPUT */}
          <div className="relative group">
            <div className={`absolute -inset-0.5 bg-gradient-to-r from-red-600 to-rose-600 rounded-[26px] opacity-20 group-focus-within:opacity-60 blur transition duration-500`}></div>
            <textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Descreva sua imagem complexa e detalhada aqui..."
              className={`relative w-full h-40 rounded-[24px] p-6 text-[15px] leading-relaxed resize-none outline-none transition-all duration-300 ${design.input} focus:bg-[#0f0f10] shadow-inner`}
            />
            
            {/* Botão de Upload de Referência */}
            <div className="absolute bottom-4 left-4 z-10">
               {referenceImage ? (
                  <div className="flex items-center gap-2 bg-zinc-800 text-zinc-200 border border-white/10 px-3 py-1.5 rounded-full text-xs font-semibold animate-in zoom-in">
                    <div className="w-4 h-4 overflow-hidden rounded-full">
                       <img src={referenceImage.preview} className="w-full h-full object-cover" alt="ref" />
                    </div>
                    <span>Ref</span>
                    <button onClick={(e) => { e.stopPropagation(); setReferenceImage(null); }} className="hover:text-red-400 ml-1"><X size={12}/></button>
                  </div>
               ) : (
                  <label className={`p-2.5 rounded-full cursor-pointer hover:bg-zinc-800 transition-colors flex items-center justify-center bg-black/50 border border-white/5 hover:border-red-500/30 backdrop-blur-sm group/upload`}>
                      <Upload size={16} className="text-zinc-500 group-hover/upload:text-red-400 transition-colors" />
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
                  ? 'bg-orange-600/10 border-orange-600/50 text-orange-500 shadow-[0_0_15px_rgba(234,88,12,0.1)]' 
                  : 'bg-[#09090b] border-white/5 text-zinc-500 hover:bg-zinc-900 hover:border-white/10'}`}
            >
              <Zap size={14} className={isTurboMode ? "fill-orange-500" : ""} />
              {isTurboMode ? (isSquare ? "Modo Turbo" : "Turbo (Auto HQ)") : "Modo HQ"}
            </button>
            <button 
              onClick={() => setIsMagicPrompt(!isMagicPrompt)}
              className={`py-4 rounded-2xl border text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-300 active:scale-95
                ${isMagicPrompt 
                  ? 'bg-red-600/10 border-red-600/50 text-red-500 shadow-[0_0_15px_rgba(220,38,38,0.1)]' 
                  : 'bg-[#09090b] border-white/5 text-zinc-500 hover:bg-zinc-900 hover:border-white/10'}`}
            >
              <Wand2 size={14} className={isMagicPrompt ? "fill-red-500" : ""} />
              Magic V2
            </button>
          </div>

          {/* SELETOR DE FORMATO */}
          <div className="space-y-3">
             <label className="text-[10px] font-bold uppercase tracking-widest ml-1 text-zinc-600 flex justify-between">
                <span>Formato</span>
                {!isSquare && !referenceImage && isTurboMode && (
                   <span className="text-orange-500 flex items-center gap-1"><Activity size={10}/> Requer HQ</span>
                )}
             </label>
             <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar mask-linear-fade">
                {[AspectRatio.WIDE_PORTRAIT, AspectRatio.WIDE_LANDSCAPE, AspectRatio.SQUARE, AspectRatio.PORTRAIT, AspectRatio.LANDSCAPE].map((ratio) => (
                  <button
                    key={ratio}
                    onClick={() => setAspectRatio(ratio)}
                    className={`flex-shrink-0 px-4 py-3 rounded-xl text-[11px] font-bold border transition-all whitespace-nowrap active:scale-95 flex items-center gap-2
                      ${aspectRatio === ratio 
                        ? 'bg-zinc-100 text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.1)]' 
                        : 'bg-[#09090b] border-white/5 text-zinc-500 hover:bg-zinc-900 hover:border-white/10'
                      }`}
                  >
                    {ratio === AspectRatio.WIDE_PORTRAIT && <Smartphone size={12} />}
                    {ratio === AspectRatio.WIDE_LANDSCAPE && <Monitor size={12} />}
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
                  className={`w-full py-5 rounded-[24px] font-bold text-[15px] tracking-wide text-white shadow-2xl transform transition-all active:scale-[0.98] disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-3 ${design.primaryGradient} hover:shadow-red-500/25 overflow-hidden relative group`}
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
                      <span className="relative z-10">GERAR ARTE AGORA</span>
                    </>
                  )}
                </button>
                
                {errorMsg && (
                  <div className="flex items-center gap-3 text-xs text-red-400 bg-red-950/30 p-4 rounded-xl border border-red-500/20 animate-in fade-in slide-in-from-top-2">
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
                                
                                {/* Gradiente inferior */}
                                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent opacity-80" />

                                {/* Overlay de Ações */}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-4 backdrop-blur-sm">
                                    <button 
                                        onClick={() => handleDownload(img.url, img.id)}
                                        className="w-14 h-14 rounded-2xl bg-white text-black flex items-center justify-center hover:scale-110 hover:bg-red-50 hover:text-red-600 transition-all shadow-lg"
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
                                <span className={`text-[9px] font-bold uppercase px-2.5 py-1 rounded-md border border-white/5 tracking-wider flex items-center gap-1
                                  ${img.model === MODEL_IDS.HIGH_QUALITY ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}
                                `}>
                                    {img.model === MODEL_IDS.HIGH_QUALITY ? <Activity size={10}/> : <Zap size={10} className="fill-orange-400"/>}
                                    {img.model === MODEL_IDS.HIGH_QUALITY ? 'HQ' : 'TURBO'}
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
                    <p className="text-sm font-medium tracking-wide text-zinc-500 uppercase">Pronto para criar</p>
                </div>
              )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default App;
