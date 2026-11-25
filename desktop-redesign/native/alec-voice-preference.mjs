// ALEC-owned voice preference; never depends on the old Roamies installation after saving.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomBytes} from 'node:crypto';
const ID=/^[a-f0-9]{32}$/i;
export function parseFishReference(value){
  if(typeof value!=='string'||value.length>2048)throw Error('Introduz um link de voz Fish Audio ou um ID válido.');
  const s=value.trim();if(ID.test(s))return s.toLowerCase();
  let u;try{u=new URL(s);}catch{throw Error('Introduz um link Fish Audio ou um ID de 32 caracteres.');}
  if(u.protocol!=='https:'||!['fish.audio','www.fish.audio'].includes(u.hostname)||u.username||u.password||u.port)throw Error('Usa apenas um link HTTPS oficial de fish.audio.');
  const m=/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:m|model|models)\/([a-f0-9]{32})\/?$/i.exec(u.pathname);
  if(!m)throw Error('O link deve apontar para uma voz Fish Audio, não para uma página de pesquisa.');
  return m[1].toLowerCase();
}
export function voiceDirectory(env=process.env,home=os.homedir()){
  return path.join(env.ROAMIES_DATA_DIR||home,'ALEC','Preferences');
}
export function createVoicePreference({directory=voiceDirectory(),legacyVoice=''}={}){
  const file=path.join(directory,'fish-voice.json');
  let value='',problem='';
  function write(id){
    fs.mkdirSync(directory,{recursive:true,mode:0o700});
    const temp=file+'.'+randomBytes(8).toString('hex')+'.tmp';
    try{fs.writeFileSync(temp,JSON.stringify({version:1,referenceId:id})+'\n',{mode:0o600,flag:'wx'});fs.renameSync(temp,file);}
    finally{try{fs.rmSync(temp,{force:true});}catch{}}
    value=id;problem='';
  }
  try{
    const st=fs.statSync(file);if(!st.isFile()||st.size>8192)throw Error('Invalid preference');
    const v=JSON.parse(fs.readFileSync(file,'utf8'));
    if(v.version!==1||typeof v.referenceId!=='string'||(v.referenceId!==''&&!ID.test(v.referenceId)))throw Error('Invalid preference');
    value=v.referenceId.toLowerCase();
  }catch(e){
    if(e.code==='ENOENT'){if(ID.test(legacyVoice)&&!/^0+$/.test(legacyVoice)){try{write(legacyVoice.toLowerCase());}catch{value=legacyVoice.toLowerCase();problem='Não foi possível guardar a voz migrada.';}}}
    else problem='Preferência de voz ilegível. Introduz novamente o link e guarda.';
  }
  return Object.freeze({get:()=>value,problem:()=>problem,save:input=>{const id=parseFishReference(input);write(id);return id;},reset:()=>write('')});
}
// Guidance reflects the real compact dashboard, not the original upstream UI.
export function aboutAlec({name='ALEC',looks=[],voice=true,wake=true,snap=true}={}){
 return [
 'ALEC Desktop — Adaptive Logical Executive Companion. Core 0.1.51 baseado em Roamies (AGPL-3.0). A aplicação chama-se ALEC; '+name+' é o personagem seleccionado.',
 'No Windows, abre o painel pelo ícone ALEC junto ao relógio (pode estar nos ícones ocultos). É uma janela compacta que fecha ao perder foco. O orb segue o cursor; a barra Ask nativa é separada.',
 'Menu lateral: Assistente (orb, Escutar, Ask e feedback); Conversas (histórico e nova conversa); Visão (captura e análise de ecrã); Memória (factos e compromissos); ALEC Remote (Bridge e permissões); Skill Hub (habilidades, agentes e integrações); Definições; Sobre.',
 'Definições > Inteligência artificial: provedores, chaves API, modelos locais e opções de agentes/híbridos quando disponíveis. Modelos sem ferramentas ou visão têm capacidade limitada a conversa. Não prometas visão ou controlo se o modelo não suporta.',
 'Definições > Voz e áudio: selecciona Fish Audio, Gemini ou VoiceStudio; configura a chave do fornecedor e respostas por voz. Em Fish Audio, cola o link oficial da voz ou o ID de 32 caracteres em Voz personalizada e guarda. Aplica-se a todos os personagens, persiste no ALEC e usa S2.1 Pro Free. O ID da voz não é a chave API. É possível repor as vozes de origem. Com Gemini ou VoiceStudio, as respectivas definições mantêm-se independentes.',
 'Definições > Activação e escuta: microfone, reconhecimento de voz e frase de activação quando disponíveis. '+(voice&&wake?'A frase pode ser personalizada.':'Não prometas activação por voz sem suporte.'),
 'Definições > Personalidade, sistema e privacidade: comportamento, permissões, arranque e opções avançadas do Bridge. Aparência: personagens ('+looks.join(', ')+'), tamanho e movimento. Atalhos: comandos nativos. Novidades: histórico de versões.',
 'ALEC Remote: usa o interruptor Bridge · Tailscale para detectar o Tailscale e iniciar/parar o serviço. A primeira configuração ainda requer Python e a pasta V16 auditada. Não prometas QR, reconexão persistente nem chamadas proactivas nesta versão; ainda não foram disponibilizados. As permissões de Ask, ficheiros, ecrã e webcam são independentes.',
 'Sobre apresenta o autor do ALEC, Website, Instagram e a referência Core. Não existe secção Help, Setup Guide, Show Logs ou Save Diagnostics no painel. Em Personalidade, sistema e privacidade, a opção de iniciar com o Windows controla apenas o ALEC. Actualizações do ALEC são distribuídas separadamente; nunca recomendes actualizar o Roamies para actualizar o ALEC.',
 snap?'Visão permite seleccionar uma área e analisar ou marcar o ecrã, com as permissões e modelos necessários.':'Captura de ecrã indisponível neste sistema.'
 ].join('\n');
}
